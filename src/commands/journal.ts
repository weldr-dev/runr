/**
 * Journal commands: journal, note, open
 *
 * Generate case files for agent runs with notes and markdown output.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { buildJournal } from '../journal/builder.js';
import { renderJournal } from '../journal/renderer.js';
import { getRunsRoot } from '../store/runs-root.js';

interface JournalOptions {
  repo?: string;
  runId?: string;
  output?: string;
  force?: boolean;
}

interface NoteOptions {
  repo?: string;
  runId?: string;
}

interface OpenOptions {
  repo?: string;
  runId?: string;
}

/**
 * Journal command: Generate and optionally display journal.md
 *
 * Usage:
 *   runr journal [run_id] [--repo <path>] [--output <file>] [--force]
 */
export async function journalCommand(options: JournalOptions): Promise<void> {
  const repo = options.repo || process.cwd();
  const runId = options.runId || findLatestRunId(repo);

  if (!runId) {
    console.error('ERROR: No runs found. Specify --run-id or create a run first.');
    process.exit(1);
  }

  const runDir = path.join(getRunsRoot(repo), runId);

  if (!fs.existsSync(runDir)) {
    console.error(`ERROR: Run directory not found: ${runDir}`);
    process.exit(1);
  }

  try {
    // Build journal.json
    const journal = await buildJournal(runId, repo);

    // Render markdown
    const markdown = renderJournal(journal);

    // Determine output path
    const outputPath = options.output || path.join(runDir, 'journal.md');

    // Check if file exists and not forcing
    if (fs.existsSync(outputPath) && !options.force) {
      // Check if journal.json is newer than journal.md
      const journalMtime = getMtime(path.join(runDir, 'journal.json'));
      const markdownMtime = getMtime(outputPath);

      if (journalMtime && markdownMtime && journalMtime <= markdownMtime) {
        console.log(`✓ Journal is up to date: ${outputPath}`);
        console.log(`\n${markdown}`);
        return;
      }
    }

    // Write markdown file
    fs.writeFileSync(outputPath, markdown, 'utf-8');

    console.log(`✓ Journal generated: ${outputPath}`);
    console.log(`\n${markdown}`);
  } catch (err) {
    console.error('ERROR:', (err as Error).message);
    process.exit(1);
  }
}

/**
 * Note command: Append timestamped note to notes.jsonl
 *
 * Usage:
 *   runr note <message> [--run-id <id>] [--repo <path>]
 */
export async function noteCommand(message: string, options: NoteOptions): Promise<void> {
  const repo = options.repo || process.cwd();
  const runId = options.runId || findLatestRunId(repo);

  if (!runId) {
    console.error('ERROR: No runs found. Specify --run-id or create a run first.');
    process.exit(1);
  }

  const runDir = path.join(getRunsRoot(repo), runId);

  if (!fs.existsSync(runDir)) {
    console.error(`ERROR: Run directory not found: ${runDir}`);
    process.exit(1);
  }

  const notesPath = path.join(runDir, 'notes.jsonl');

  // Append note
  const note = {
    timestamp: new Date().toISOString(),
    message
  };

  try {
    fs.appendFileSync(notesPath, JSON.stringify(note) + '\n', 'utf-8');
    console.log(`✓ Note added to run ${runId}`);
    console.log(`  "${message}"`);
  } catch (err) {
    console.error('ERROR:', (err as Error).message);
    process.exit(1);
  }
}

/**
 * Open command: Open journal.md in editor
 *
 * Usage:
 *   runr open [run_id] [--repo <path>]
 */
export async function openCommand(options: OpenOptions): Promise<void> {
  const repo = options.repo || process.cwd();
  const runId = options.runId || findLatestRunId(repo);

  if (!runId) {
    console.error('ERROR: No runs found. Specify --run-id or create a run first.');
    process.exit(1);
  }

  const runDir = path.join(getRunsRoot(repo), runId);
  const journalPath = path.join(runDir, 'journal.md');

  if (!fs.existsSync(journalPath)) {
    console.log(`Journal not found. Generating...`);

    try {
      const journal = await buildJournal(runId, repo);
      const markdown = renderJournal(journal);
      fs.writeFileSync(journalPath, markdown, 'utf-8');
      console.log(`✓ Journal generated: ${journalPath}`);
    } catch (err) {
      console.error('ERROR:', (err as Error).message);
      process.exit(1);
    }
  }

  // Open in editor
  const editor = process.env.EDITOR || 'vim';

  try {
    execSync(`${editor} "${journalPath}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`ERROR: Failed to open editor: ${(err as Error).message}`);
    process.exit(1);
  }
}

/**
 * Find the latest run ID in the runs directory
 */
function findLatestRunId(repo: string): string | null {
  const runsRoot = getRunsRoot(repo);

  if (!fs.existsSync(runsRoot)) {
    return null;
  }

  const entries = fs.readdirSync(runsRoot, { withFileTypes: true });
  const runDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => /^\d{14}$/.test(name)) // Format: YYYYMMDDHHMMSS
    .sort()
    .reverse();

  return runDirs[0] || null;
}

/**
 * Get file modification time (returns null if file doesn't exist)
 */
function getMtime(filePath: string): number | null {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}
