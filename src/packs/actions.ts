import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { InitAction } from './loader.js';
import { renderTemplate, TemplateContext } from './renderer.js';

/**
 * Result of executing an init action
 */
export interface ActionResult {
  action: InitAction;
  executed: boolean; // Whether action was actually performed
  message: string; // Human-readable result message
  error?: string; // Error message if action failed
}

/**
 * Context for action execution
 */
export interface ActionContext {
  repoPath: string; // Repository root path
  packDir: string; // Pack directory (for loading templates)
  templates: Record<string, string>; // Template name -> relative path mapping
  templateContext: TemplateContext; // Variables for template rendering
  flags: Record<string, boolean>; // Flags (e.g., with_claude)
  dryRun: boolean; // If true, don't actually execute
}

/**
 * Ensure .gitignore contains the specified entry.
 * Idempotent: only adds if not already present.
 */
async function ensureGitignoreEntry(
  action: Extract<InitAction, { type: 'ensure_gitignore_entry' }>,
  context: ActionContext
): Promise<ActionResult> {
  const gitignorePath = path.join(context.repoPath, action.path);
  const entry = action.line;

  try {
    let content = '';
    try {
      content = await fsPromises.readFile(gitignorePath, 'utf-8');
    } catch {
      // File doesn't exist, will be created
    }

    // Check if entry already exists
    const lines = content.split('\n');
    const hasEntry = lines.some(line => line.trim() === entry.trim());

    if (hasEntry) {
      return {
        action,
        executed: false,
        message: `Entry "${entry}" already in ${action.path}`
      };
    }

    if (context.dryRun) {
      return {
        action,
        executed: false,
        message: `[DRY RUN] Would add "${entry}" to ${action.path}`
      };
    }

    // Add entry
    const newContent = content.endsWith('\n') || content === ''
      ? `${content}${entry}\n`
      : `${content}\n${entry}\n`;

    await fsPromises.writeFile(gitignorePath, newContent);

    return {
      action,
      executed: true,
      message: `Added "${entry}" to ${action.path}`
    };
  } catch (error) {
    return {
      action,
      executed: false,
      message: `Failed to update ${action.path}`,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Create a file from template if it doesn't already exist.
 * Idempotent: only creates if file is missing.
 */
async function createFileIfMissing(
  action: Extract<InitAction, { type: 'create_file_if_missing' }>,
  context: ActionContext
): Promise<ActionResult> {
  const targetPath = path.join(context.repoPath, action.path);

  // Check "when" condition
  if (action.when?.flag) {
    const flagValue = context.flags[action.when.flag];
    if (!flagValue) {
      return {
        action,
        executed: false,
        message: `Skipped ${action.path} (flag "${action.when.flag}" not set)`
      };
    }
  }

  // Check if file already exists
  if (fs.existsSync(targetPath)) {
    return {
      action,
      executed: false,
      message: `File ${action.path} already exists`
    };
  }

  try {
    // Load template
    const templateRelPath = context.templates[action.template];
    if (!templateRelPath) {
      return {
        action,
        executed: false,
        message: `Template "${action.template}" not found in pack`,
        error: 'Template not found in manifest'
      };
    }

    const templatePath = path.join(context.packDir, templateRelPath);

    // Security: Verify template path is within pack directory (prevent directory traversal)
    const resolvedTemplatePath = path.resolve(templatePath);
    const resolvedPackDir = path.resolve(context.packDir);
    if (!resolvedTemplatePath.startsWith(resolvedPackDir + path.sep)) {
      return {
        action,
        executed: false,
        message: `Template path escapes pack directory: ${templateRelPath}`,
        error: 'Invalid template path'
      };
    }

    if (!fs.existsSync(templatePath)) {
      return {
        action,
        executed: false,
        message: `Template file not found: ${templateRelPath}`,
        error: 'Template file missing'
      };
    }

    if (context.dryRun) {
      return {
        action,
        executed: false,
        message: `[DRY RUN] Would create ${action.path} from template ${action.template}`
      };
    }

    // Read and render template
    const templateContent = await fsPromises.readFile(templatePath, 'utf-8');
    const rendered = renderTemplate(templateContent, context.templateContext);

    // Ensure parent directory exists
    const parentDir = path.dirname(targetPath);
    await fsPromises.mkdir(parentDir, { recursive: true });

    // Write file
    await fsPromises.writeFile(targetPath, rendered);

    // Set permissions if specified
    if (action.mode) {
      const mode = parseInt(action.mode, 8);
      await fsPromises.chmod(targetPath, mode);
    }

    return {
      action,
      executed: true,
      message: `Created ${action.path} from template ${action.template}`
    };
  } catch (error) {
    return {
      action,
      executed: false,
      message: `Failed to create ${action.path}`,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Execute a single init action
 */
export async function executeAction(
  action: InitAction,
  context: ActionContext
): Promise<ActionResult> {
  switch (action.type) {
    case 'ensure_gitignore_entry':
      return ensureGitignoreEntry(action, context);
    case 'create_file_if_missing':
      return createFileIfMissing(action, context);
    default:
      return {
        action,
        executed: false,
        message: 'Unknown action type',
        error: `Unknown action type: ${(action as any).type}`
      };
  }
}

/**
 * Execute all init actions from a pack
 */
export async function executeActions(
  actions: InitAction[],
  context: ActionContext
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  for (const action of actions) {
    const result = await executeAction(action, context);
    results.push(result);
  }

  return results;
}
