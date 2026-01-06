import { execa } from 'execa';
import path from 'node:path';
import fs from 'node:fs';
import { getRunrPaths } from '../store/runs-root.js';

export interface MetaOptions {
  repo?: string;
  tool?: 'auto' | 'claude' | 'codex';
  allowDirty?: boolean;
  interactive?: boolean; // If true, ask for permission on each tool use (default: false)
}

/**
 * Detect which meta-agent tool is available
 */
async function detectTool(): Promise<'claude' | 'codex' | null> {
  // Try Claude Code first
  try {
    const result = await execa('claude', ['--version'], {
      timeout: 5000,
      reject: false
    });
    if (result.exitCode === 0) {
      return 'claude';
    }
  } catch {
    // Claude not found, continue
  }

  // Try Codex CLI
  try {
    const result = await execa('codex', ['--version'], {
      timeout: 5000,
      reject: false
    });
    if (result.exitCode === 0) {
      return 'codex';
    }
  } catch {
    // Codex not found
  }

  return null;
}

/**
 * Check if working tree is clean
 */
async function checkWorkingTree(repoPath: string): Promise<{
  clean: boolean;
  uncommittedCount: number;
}> {
  try {
    const result = await execa('git', ['status', '--porcelain'], {
      cwd: repoPath,
      reject: false
    });

    if (result.exitCode !== 0) {
      throw new Error('git status failed');
    }

    const lines = result.stdout.trim().split('\n').filter(line => line.length > 0);
    return {
      clean: lines.length === 0,
      uncommittedCount: lines.length
    };
  } catch (error) {
    throw new Error(`Failed to check working tree: ${(error as Error).message}`);
  }
}

/**
 * Check if repository is properly set up for Runr
 */
function checkRepoSetup(repoPath: string): {
  configExists: boolean;
  gitignoreOk: boolean;
  agentsMdExists: boolean;
  missingSetup: string[];
} {
  const paths = getRunrPaths(repoPath);
  const configPath = path.join(paths.runr_root, 'runr.config.json');
  const gitignorePath = path.join(repoPath, '.gitignore');
  const agentsMdPath = path.join(repoPath, 'AGENTS.md');

  const configExists = fs.existsSync(configPath);
  const agentsMdExists = fs.existsSync(agentsMdPath);

  // Check gitignore
  let gitignoreOk = false;
  try {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    const lines = content.split('\n').map(l => l.trim());
    gitignoreOk = lines.some(line =>
      line.startsWith('.runr/') || line === '.runr' || line === '.runr/'
    );
  } catch {
    // .gitignore doesn't exist
  }

  const missingSetup: string[] = [];
  if (!configExists) missingSetup.push('.runr/runr.config.json');
  if (!gitignoreOk) missingSetup.push('.gitignore entries');
  if (!agentsMdExists) missingSetup.push('AGENTS.md');

  return {
    configExists,
    gitignoreOk,
    agentsMdExists,
    missingSetup
  };
}

/**
 * Check Claude Code integration status
 */
function checkClaudeIntegration(repoPath: string): {
  skillsPresent: boolean;
  commandsPresent: boolean;
  missingFiles: string[];
} {
  const skillPath = path.join(repoPath, '.claude/skills/runr-workflow/SKILL.md');
  const commandPaths = [
    path.join(repoPath, '.claude/commands/runr-bundle.md'),
    path.join(repoPath, '.claude/commands/runr-submit.md'),
    path.join(repoPath, '.claude/commands/runr-resume.md')
  ];

  const skillsPresent = fs.existsSync(skillPath);
  const commandsPresent = commandPaths.every(p => fs.existsSync(p));

  const missingFiles: string[] = [];
  if (!skillsPresent) missingFiles.push('.claude/skills/runr-workflow/SKILL.md');
  commandPaths.forEach(p => {
    if (!fs.existsSync(p)) {
      missingFiles.push(path.relative(repoPath, p));
    }
  });

  return {
    skillsPresent,
    commandsPresent,
    missingFiles
  };
}

/**
 * Launch the meta-agent tool
 */
async function launchTool(tool: 'claude' | 'codex', repoPath: string, interactive: boolean): Promise<void> {
  console.log(`\nLaunching ${tool === 'claude' ? 'Claude Code' : 'Codex CLI'} with Runr workflow...\n`);

  if (tool === 'claude') {
    console.log('Agent will follow rules from:');
    console.log('- AGENTS.md (workflow guide)');

    const claudeCheck = checkClaudeIntegration(repoPath);
    if (claudeCheck.skillsPresent) {
      console.log('- .claude/skills/runr-workflow (safety playbook)');
    }
    if (claudeCheck.commandsPresent) {
      console.log('- .claude/commands/ (runr shortcuts)');
    }
  } else {
    console.log('Agent will follow rules from:');
    console.log('- AGENTS.md (workflow guide, read by Codex)');
  }

  if (!interactive && tool === 'claude') {
    console.log('\nPermission mode: skip all permissions (allows Bash, Edit, etc.)');
  }
  console.log('Exit with Ctrl+C\n');
  console.log('─'.repeat(60));
  console.log();

  // Launch the tool in interactive mode
  try {
    // Build args based on tool
    const args: string[] = [];

    if (tool === 'claude' && !interactive) {
      // Use dangerously-skip-permissions to bypass all confirmation dialogs
      // This matches what Runr uses when running Claude as a worker
      // Allows the agent to use Bash (for runr commands), Edit, and other tools
      args.push('--dangerously-skip-permissions');
    }

    await execa(tool, args, {
      cwd: repoPath,
      stdio: 'inherit'
    });
  } catch (error) {
    // User likely pressed Ctrl+C
    console.log('\nMeta-agent session ended.');
  }
}

/**
 * Main meta command implementation
 */
export async function metaCommand(options: MetaOptions): Promise<void> {
  const repoPath = path.resolve(options.repo || '.');

  // Step 1: Detect tool
  let tool: 'claude' | 'codex';
  if (options.tool === 'auto' || !options.tool) {
    const detected = await detectTool();
    if (!detected) {
      console.error('❌ No meta-agent tool found\n');
      console.error('Install one of:');
      console.error('  • Claude Code: https://code.claude.com');
      console.error('  • Codex CLI: https://github.com/openai/codex-cli');
      process.exit(2);
    }
    tool = detected;
  } else {
    tool = options.tool;

    // Verify the requested tool is available
    const detected = await detectTool();
    if (detected !== tool) {
      console.error(`❌ Requested tool "${tool}" not found`);
      console.error('Run with --tool auto to detect available tools');
      process.exit(2);
    }
  }

  // Step 2: Check working tree
  try {
    const treeCheck = await checkWorkingTree(repoPath);

    if (!treeCheck.clean) {
      if (options.allowDirty) {
        console.log('⚠️  WARNING: Working tree has uncommitted changes\n');
        console.log('Running agents on uncommitted work risks data loss.');
        console.log('You used --allow-dirty to override this safety check.\n');
      } else {
        console.error('⛔ BLOCKED: Working tree has uncommitted changes\n');
        console.error('Running agents on uncommitted work risks data loss.\n');
        console.error('Fix with:');
        console.error('  git commit -am "WIP: save before agent"');
        console.error('  # OR');
        console.error('  git stash\n');
        console.error('To override (not recommended):');
        console.error('  runr meta --allow-dirty');
        process.exit(1);
      }
    }
  } catch (error) {
    console.error(`❌ Failed to check working tree: ${(error as Error).message}`);
    process.exit(1);
  }

  // Step 3: Check repo setup
  const setup = checkRepoSetup(repoPath);
  if (setup.missingSetup.length > 0) {
    console.error('⚠️  Incomplete Runr setup\n');
    console.error('Missing:');
    setup.missingSetup.forEach(item => console.error(`  • ${item}`));
    console.error('\nFix with:');
    console.error('  runr init --pack solo');
    console.error();
    process.exit(1);
  }

  // Step 4: Claude-specific checks
  if (tool === 'claude') {
    const claudeCheck = checkClaudeIntegration(repoPath);

    if (!claudeCheck.skillsPresent || !claudeCheck.commandsPresent) {
      console.log('💡 Tip: Claude Code integration incomplete\n');
      console.log('Missing:');
      claudeCheck.missingFiles.forEach(file => console.log(`  • ${file}`));
      console.log('\nFor better integration, run:');
      console.log('  runr init --pack solo --with-claude\n');
      console.log('(This will add Claude Code skills and commands)\n');

      // Don't block, just inform
    }
  }

  // Step 5: Launch tool
  await launchTool(tool, repoPath, options.interactive || false);
}
