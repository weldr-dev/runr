import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Pack manifest structure (v1)
 */
export interface PackManifest {
  pack_version: 1;
  name: string;
  display_name: string;
  description: string;
  defaults?: {
    profile?: 'solo' | 'pr' | 'trunk';
    integration_branch?: string;
    release_branch?: string;
    submit_strategy?: 'cherry-pick';
    require_clean_tree?: boolean;
    require_verification?: boolean;
    protected_branches?: string[];
  };
  templates?: Record<string, string>;
  init_actions?: InitAction[];
}

/**
 * Init action types (v1)
 */
export type InitAction =
  | {
      type: 'ensure_gitignore_entry';
      path: string;
      line: string;
    }
  | {
      type: 'create_file_if_missing';
      path: string;
      template: string;
      mode?: string;
      when?: { flag: string };
    };

/**
 * Validation result for a pack
 */
export interface PackValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Loaded pack with validation status
 */
export interface LoadedPack {
  name: string;
  packDir: string;
  manifest: PackManifest;
  validation: PackValidation;
}

/**
 * Get the packs directory path (repo root / packs)
 */
function getPacksDir(): string {
  // Go up from src/packs/loader.ts to repo root
  return path.resolve(__dirname, '../../packs');
}

/**
 * Get the packs directory path (public API for debugging)
 */
export function getPacksDirectory(): string {
  return getPacksDir();
}

/**
 * Validate a pack manifest
 */
function validatePackManifest(manifest: any, packDir: string): PackValidation {
  const errors: string[] = [];

  // Check required fields
  if (typeof manifest !== 'object' || manifest === null) {
    errors.push('Manifest must be an object');
    return { valid: false, errors };
  }

  if (manifest.pack_version !== 1) {
    errors.push(`pack_version must be 1, got: ${manifest.pack_version}`);
  }

  if (typeof manifest.name !== 'string' || !manifest.name.match(/^[a-z][a-z0-9-]*$/)) {
    errors.push(`name must be lowercase alphanumeric with hyphens, got: ${manifest.name}`);
  }

  if (typeof manifest.display_name !== 'string' || manifest.display_name.length === 0) {
    errors.push('display_name is required and must be a non-empty string');
  }

  if (typeof manifest.description !== 'string' || manifest.description.length === 0) {
    errors.push('description is required and must be a non-empty string');
  }

  // Validate templates (if provided)
  if (manifest.templates) {
    if (typeof manifest.templates !== 'object') {
      errors.push('templates must be an object');
    } else {
      for (const [key, templatePath] of Object.entries(manifest.templates)) {
        if (typeof templatePath !== 'string') {
          errors.push(`Template path for "${key}" must be a string`);
          continue;
        }
        const fullPath = path.join(packDir, templatePath as string);
        if (!fs.existsSync(fullPath)) {
          errors.push(`Template file not found: ${templatePath}`);
        }
      }
    }
  }

  // Validate init_actions (if provided)
  if (manifest.init_actions) {
    if (!Array.isArray(manifest.init_actions)) {
      errors.push('init_actions must be an array');
    } else {
      for (let i = 0; i < manifest.init_actions.length; i++) {
        const action = manifest.init_actions[i];
        if (!action.type) {
          errors.push(`Action ${i}: missing type field`);
          continue;
        }

        if (action.type === 'ensure_gitignore_entry') {
          if (!action.path || typeof action.path !== 'string') {
            errors.push(`Action ${i}: ensure_gitignore_entry requires path (string)`);
          }
          if (!action.line || typeof action.line !== 'string') {
            errors.push(`Action ${i}: ensure_gitignore_entry requires line (string)`);
          }
        } else if (action.type === 'create_file_if_missing') {
          if (!action.path || typeof action.path !== 'string') {
            errors.push(`Action ${i}: create_file_if_missing requires path (string)`);
          }
          if (!action.template || typeof action.template !== 'string') {
            errors.push(`Action ${i}: create_file_if_missing requires template (string)`);
          }
          if (action.mode && !action.mode.match(/^0[0-7]{3}$/)) {
            errors.push(`Action ${i}: mode must be octal string (e.g., "0644")`);
          }
        } else {
          errors.push(`Action ${i}: unknown action type "${action.type}"`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Load a single pack from a directory
 */
function loadPack(packDir: string): LoadedPack | null {
  const manifestPath = path.join(packDir, 'pack.json');

  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  const packName = path.basename(packDir);

  try {
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);
    const validation = validatePackManifest(manifest, packDir);

    return {
      name: packName,
      packDir,
      manifest,
      validation
    };
  } catch (error) {
    return {
      name: packName,
      packDir,
      manifest: {} as PackManifest,
      validation: {
        valid: false,
        errors: [`Failed to parse pack.json: ${error instanceof Error ? error.message : String(error)}`]
      }
    };
  }
}

/**
 * Load all available packs
 */
export function loadAllPacks(): LoadedPack[] {
  const packsDir = getPacksDir();

  if (!fs.existsSync(packsDir)) {
    return [];
  }

  const entries = fs.readdirSync(packsDir, { withFileTypes: true });
  const packs: LoadedPack[] = [];

  for (const entry of entries) {
    // Skip non-directories and special directories
    if (!entry.isDirectory() || entry.name.startsWith('_')) {
      continue;
    }

    const packDir = path.join(packsDir, entry.name);
    const pack = loadPack(packDir);

    if (pack) {
      packs.push(pack);
    }
  }

  return packs;
}

/**
 * Sanitize pack name to prevent directory traversal
 */
function sanitizePackName(name: string): string | null {
  // Only allow lowercase letters, numbers, and hyphens
  // No dots, slashes, or other special characters
  if (!name.match(/^[a-z][a-z0-9-]*$/)) {
    return null;
  }

  // Additional check: ensure the sanitized name doesn't try to escape
  const normalized = path.normalize(name);
  if (normalized !== name || normalized.includes('..') || normalized.includes('/')) {
    return null;
  }

  return name;
}

/**
 * Load a specific pack by name
 */
export function loadPackByName(name: string): LoadedPack | null {
  // Sanitize pack name to prevent directory traversal
  const sanitizedName = sanitizePackName(name);
  if (!sanitizedName) {
    return null;
  }

  const packsDir = getPacksDir();
  const packDir = path.join(packsDir, sanitizedName);

  // Verify the resolved path is actually within packsDir (defense in depth)
  const resolvedPackDir = path.resolve(packDir);
  const resolvedPacksDir = path.resolve(packsDir);
  if (!resolvedPackDir.startsWith(resolvedPacksDir + path.sep)) {
    return null;
  }

  if (!fs.existsSync(packDir)) {
    return null;
  }

  return loadPack(packDir);
}

/**
 * Get a list of valid pack names
 */
export function getValidPackNames(): string[] {
  const packs = loadAllPacks();
  return packs.filter(p => p.validation.valid).map(p => p.name);
}
