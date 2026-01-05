# Pack Packaging

## npm Package Structure

When Runr is published to npm, packs are included as static assets alongside the compiled JavaScript.

### Published Directory Structure

```
node_modules/@weldr/runr/
├── dist/               # Compiled TypeScript
│   └── packs/         # Compiled pack loader
├── packs/             # Pack assets (source)
│   └── solo/
│       ├── pack.json
│       └── templates/
└── package.json
```

### Package.json "files" Field

The `package.json` includes packs in the published package:

```json
{
  "files": [
    "dist/",
    "packs/",
    "!packs/_schema/",
    ...
  ]
}
```

Note: `packs/_schema/` is excluded (documentation only).

## Path Resolution

The pack loader resolves pack paths relative to the **installed module**, not the current working directory:

```typescript
// In dist/packs/loader.js:
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname = /path/to/node_modules/@weldr/runr/dist/packs
const packsDir = path.resolve(__dirname, '../../packs');
// packsDir = /path/to/node_modules/@weldr/runr/packs
```

This ensures packs are always loaded from the installed Runr package, regardless of where the user runs `runr` commands.

## Verification

### Local Testing

Test pack installation from tarball:

```bash
# Create tarball
npm pack

# Install in test directory
mkdir /tmp/test-install && cd /tmp/test-install
npm init -y
npm install /path/to/weldr-runr-*.tgz

# Verify packs are available
npx runr packs
npx runr init --pack solo --dry-run
```

### Check Tarball Contents

Verify packs are included:

```bash
npm pack
tar -tzf weldr-runr-*.tgz | grep packs/
```

Expected output:
```
package/packs/solo/pack.json
package/packs/solo/templates/AGENTS.md.tmpl
package/packs/solo/templates/CLAUDE.md.tmpl
package/packs/solo/templates/bundle.md.tmpl
```

## Common Issues

### Issue: "Pack not found" after npm install

**Cause**: `packs/` directory not included in package.json "files" field

**Fix**: Add `"packs/"` to the "files" array in package.json

### Issue: Template files missing

**Cause**: Template files not committed to git or excluded from npm package

**Fix**:
1. Ensure templates are committed: `git add packs/*/templates/`
2. Check they're not in `.npmignore` or excluded from "files"

### Issue: __dirname resolves incorrectly

**Cause**: Using CommonJS `__dirname` with ES modules

**Fix**: Use `import.meta.url` with `fileURLToPath`:
```typescript
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
```
