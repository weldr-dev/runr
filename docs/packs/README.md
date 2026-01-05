# Runr Packs Documentation

## Overview

Runr packs are **data-only** workflow presets that provide:
- Default configuration values (profile, branches, requirements)
- Documentation templates (AGENTS.md, CLAUDE.md)
- Idempotent initialization actions

## Pack Validation

Pack validation is **implemented in code** (`src/packs/loader.ts`), not via JSON Schema validation.

The `schema/pack.schema.json` file is **documentation only** - it describes the expected pack manifest structure for human reference and editor autocomplete, but the actual validation logic is in the TypeScript code.

This approach avoids adding a JSON Schema validation dependency while maintaining clear documentation of the pack format.

## Creating a Pack

1. Create a directory under `packs/<pack-name>/`
2. Add `pack.json` manifest (see schema for structure)
3. Add templates under `templates/` subdirectory
4. Test with `runr packs` to verify validation

## Pack Manifest Structure

See `schema/pack.schema.json` for the full structure. Key fields:

- `pack_version`: Must be `1`
- `name`: Lowercase alphanumeric with hyphens (e.g., `solo`, `my-pack`)
- `display_name`: Human-readable name
- `description`: Brief description
- `defaults`: Workflow configuration defaults
- `templates`: Template file mappings
- `init_actions`: Idempotent initialization actions

## Security

Pack names and template paths are sanitized to prevent directory traversal attacks:
- Pack names must match `/^[a-z][a-z0-9-]*$/`
- Template paths must be within the pack directory
- Resolved paths are verified to prevent escape

## Available Packs

### solo (recommended for solo developers)
Fast local workflow with verified checkpoints, cherry-pick submit, and minimal docs.
- **Workflow:** dev → main (branch isolation)
- Integration branch: `dev`
- Release branch: `main`
- Requires verification: Yes
- Requires clean tree: Yes

### pr (recommended for teams or reviewable changes)
Feature branch workflow with verified checkpoints, reviewable proof packets, and optional PR integration.
- **Workflow:** feature → main (via pull requests)
- Integration branch: `main`
- Release branch: `main`
- Requires verification: Yes
- Requires clean tree: Yes
- **Key feature:** `runr bundle` creates proof packets for PR descriptions

### trunk (for high-automation teams)
Work directly on main with verified checkpoints. Submit is a verification gate, not a branch operation.
- **Workflow:** main only (trunk-based development)
- Integration branch: `main`
- Release branch: `main`
- Requires verification: Yes
- Requires clean tree: Yes
- **Note:** Submit is mostly a no-op audit event; verification is the real gate
