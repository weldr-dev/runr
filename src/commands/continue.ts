/**
 * runr continue - The "do the obvious next thing" command.
 *
 * This is the router that makes Runr feel like Rails:
 * - If STOPPED with auto-fixable issue: run fix commands, then resume
 * - If STOPPED with auto-resume reason: just resume
 * - If orchestration cursor exists: continue orchestration
 * - Otherwise: print the front door
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { resolveRepoState } from '../ux/state.js';
import { computeBrain, type ContinueStrategy, type BrainOutput } from '../ux/brain.js';
import { formatFrontDoor } from '../ux/render.js';
import type { StopDiagnosisJson } from '../diagnosis/types.js';
import type { StopDiagnostics } from '../diagnosis/stop-explainer.js';
import type { CanonicalCommand } from '../ux/safe-commands.js';
import { getRunsRoot } from '../store/runs-root.js';
import { resumeCommand } from './resume.js';

export interface ContinueOptions {
  repo: string;
  confirm?: boolean;
  force?: boolean;
  json?: boolean;
}

/**
 * Result of executing a command.
 */
interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Continue artifact - written even on failure.
 */
interface ContinueArtifact {
  timestamp: string;
  runId: string;
  strategy: string;
  commands: Array<{
    command: string;
    exitCode: number;
    durationMs: number;
    logPath: string;
  }>;
  success: boolean;
  failedAt?: number;
  error?: string;
}

/**
 * Execute a canonical command and capture output.
 */
async function executeCommand(cmd: CanonicalCommand, cwd: string): Promise<CommandResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const proc = spawn(cmd.binary, cmd.args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        command: cmd.raw,
        exitCode: code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - startTime,
      });
    });

    proc.on('error', (err) => {
      resolve({
        command: cmd.raw,
        exitCode: 1,
        stdout,
        stderr: stderr + '\n' + err.message,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

/**
 * Slugify a command for use in filenames.
 */
function slugify(cmd: string): string {
  return cmd
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 50);
}

/**
 * Execute auto-fix commands and write artifacts.
 */
async function executeAutoFix(
  runId: string,
  commands: CanonicalCommand[],
  repoPath: string
): Promise<{ success: boolean; artifact: ContinueArtifact }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runsRoot = getRunsRoot(repoPath);
  const artifactDir = path.join(runsRoot, runId, 'artifacts', 'continue', timestamp);

  // Create artifact directory
  fs.mkdirSync(artifactDir, { recursive: true });

  const artifact: ContinueArtifact = {
    timestamp: new Date().toISOString(),
    runId,
    strategy: 'auto_fix',
    commands: [],
    success: false,
  };

  let success = true;

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    console.log(`Running: ${cmd.raw}`);

    const result = await executeCommand(cmd, repoPath);

    // Write log file
    const logFileName = `${i + 1}-${slugify(cmd.raw)}.log`;
    const logPath = path.join(artifactDir, logFileName);
    const logContent = [
      `Command: ${cmd.raw}`,
      `Exit code: ${result.exitCode}`,
      `Duration: ${result.durationMs}ms`,
      '',
      '=== STDOUT ===',
      result.stdout,
      '',
      '=== STDERR ===',
      result.stderr,
    ].join('\n');
    fs.writeFileSync(logPath, logContent);

    // Record in artifact
    artifact.commands.push({
      command: cmd.raw,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      logPath: logFileName,
    });

    // Check for failure
    if (result.exitCode !== 0) {
      console.log(`  Failed (exit ${result.exitCode})`);
      artifact.success = false;
      artifact.failedAt = i;
      artifact.error = `Command "${cmd.raw}" failed with exit code ${result.exitCode}`;
      success = false;
      break;
    }

    console.log(`  OK (${result.durationMs}ms)`);
  }

  if (success) {
    artifact.success = true;
  }

  // Write continue.json
  const artifactPath = path.join(artifactDir, 'continue.json');
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));

  return { success, artifact };
}

/**
 * Load diagnosis data for a stopped run.
 */
function loadDiagnosisData(
  stopJsonPath: string | null,
  diagnosticsPath: string | null
): { stopDiagnosis: StopDiagnosisJson | null; stopExplainer: StopDiagnostics | null } {
  let stopDiagnosis: StopDiagnosisJson | null = null;
  let stopExplainer: StopDiagnostics | null = null;

  if (stopJsonPath && fs.existsSync(stopJsonPath)) {
    try {
      stopDiagnosis = JSON.parse(fs.readFileSync(stopJsonPath, 'utf-8'));
    } catch {
      // Ignore parse errors
    }
  }

  if (diagnosticsPath && fs.existsSync(diagnosticsPath)) {
    try {
      stopExplainer = JSON.parse(fs.readFileSync(diagnosticsPath, 'utf-8'));
    } catch {
      // Ignore parse errors
    }
  }

  return { stopDiagnosis, stopExplainer };
}

/**
 * Print front door and exit.
 */
function printFrontDoorAndExit(brainOutput: BrainOutput): void {
  console.log(formatFrontDoor(brainOutput));
}

/**
 * Main continue command.
 */
export async function continueCommand(options: ContinueOptions): Promise<void> {
  const repoPath = options.repo || process.cwd();

  // Resolve repo state
  const state = await resolveRepoState(repoPath);

  // Load diagnosis data if we have a stopped run
  let stopDiagnosis: StopDiagnosisJson | null = null;
  let stopExplainer: StopDiagnostics | null = null;

  if (state.latestStopped) {
    const diagData = loadDiagnosisData(
      state.latestStopped.stopJsonPath,
      state.latestStopped.diagnosticsPath
    );
    stopDiagnosis = diagData.stopDiagnosis;
    stopExplainer = diagData.stopExplainer;
  }

  // Compute brain output
  const brainOutput = computeBrain({
    state,
    stopDiagnosis,
    stopExplainer,
  });

  const strategy = brainOutput.continueStrategy;

  // Route based on strategy
  switch (strategy.type) {
    case 'auto_resume': {
      console.log(`Auto-resuming run ${strategy.runId}...`);
      await resumeCommand({
        runId: strategy.runId,
        time: 120,
        maxTicks: 50,
        allowDeps: false,
        force: options.force ?? false,
        repo: repoPath,
        autoResume: true,
      });
      break;
    }

    case 'auto_fix': {
      // Check for ledger mode with --force
      if (state.mode === 'ledger' && !options.force) {
        console.error('Error: Ledger mode requires --force for auto-fix.');
        console.error('Suggested: runr continue --force');
        process.exitCode = 1;
        return;
      }

      // Check for dirty tree in ledger mode
      if (state.mode === 'ledger' && state.treeStatus === 'dirty' && !options.force) {
        console.error('Error: Working tree is dirty and mode is ledger.');
        console.error('Commit or stash changes first, or use --force.');
        process.exitCode = 1;
        return;
      }

      console.log(`Auto-fixing run ${strategy.runId}...`);
      console.log(`Running ${strategy.commands.length} command(s):\n`);

      const { success, artifact } = await executeAutoFix(
        strategy.runId,
        strategy.commands,
        repoPath
      );

      if (!success) {
        console.log('\nAuto-fix failed.');
        console.log(`Artifact written: .runr/runs/${strategy.runId}/artifacts/continue/${artifact.timestamp.replace(/[:.]/g, '-')}/continue.json`);
        console.log('\nNext steps:');
        console.log(`  1) runr report ${strategy.runId}`);
        console.log(`  2) runr intervene ${strategy.runId} --reason auto_fix_failed --note "..."`);
        console.log(`  3) runr resume ${strategy.runId}`);
        process.exitCode = 1;
        return;
      }

      console.log('\nAuto-fix complete. Resuming...\n');

      await resumeCommand({
        runId: strategy.runId,
        time: 120,
        maxTicks: 50,
        allowDeps: false,
        force: options.force ?? false,
        repo: repoPath,
        autoResume: true,
      });
      break;
    }

    case 'continue_orch': {
      console.log(`Continuing orchestration ${strategy.orchestratorId}...`);
      // TODO: Implement orchestration continuation
      // For now, print suggestion
      console.log(`Run: runr orchestrate resume ${strategy.orchestratorId}`);
      break;
    }

    case 'manual': {
      console.log(`Cannot auto-continue: ${strategy.blockedReason}`);
      console.log('');
      printFrontDoorAndExit(brainOutput);
      break;
    }

    case 'nothing': {
      printFrontDoorAndExit(brainOutput);
      break;
    }
  }
}
