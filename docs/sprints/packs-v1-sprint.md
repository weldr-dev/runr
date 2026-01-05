# Runr Packs v1 Sprint

**Sprint Goal:** Data-only workflow presets without ecosystem complexity

**Duration:** 1 day
**Status:** Complete (2026-01-05)

**v1 Scope (Shipped):**
- ✅ Pack system core (loader, renderer, actions)
- ✅ Security hardening (path sanitization, traversal protection)
- ✅ CLI integration (`runr packs`, `runr init --pack`)
- ✅ Three initial packs (solo, pr, trunk)
- ✅ Comprehensive testing (47 tests across 4 suites)
- ✅ Constraint enforcement (mechanical CI guards)
- ✅ Documentation (README, SECURITY, PACKAGING, CONSTRAINTS)
- ✅ npm packaging + global install verification

**v2 Scope (Explicitly Deferred):**
- Pack versioning beyond v1
- Plugin system (code execution from packs)
- Pack marketplace/registry
- Smart actions (edit files, run commands, modify package.json)
- Pack dependencies or composition

---

## Overview

The pack system provides **data-only extensions** with a **tiny execution engine** for safe actions. This enables workflow presets without the complexity and security risk of a plugin ecosystem.

### Core Insight

**Packs are defaults + templates + scaffold actions. Not code, not plugins.**

This is about making onboarding trivial while keeping core invariants safe:
- New user: `runr init --pack solo` → ready to work in 5 seconds
- Power user: Fork a pack or use `--print` mode for custom config
- Security: No code execution, no network calls, no git manipulation

### Why Now?

1. External users need clear workflow guidance
2. Different teams have different branching preferences
3. Repeating the same init boilerplate is friction
4. We have 2+ workflow patterns already (solo, trunk)
5. Need to ship workflow opinions without hardcoding them in core

---

## Design Philosophy: Extensions Without Ecosystem Complexity

### Be Strict About (Non-Negotiables)

These are the "no plugins" constraints:

1. **Data-only packs**
   - JSON manifests + markdown templates
   - No JavaScript, no shell scripts, no binaries

2. **Boring actions only**
   - `ensure_gitignore_entry` - append if missing
   - `create_file_if_missing` - scaffold from template
   - Nothing that modifies existing files (beyond gitignore append)

3. **Path security**
   - Pack names: `^[a-z][a-z0-9-]*$` only
   - Template paths: relative only, no `../` escapes
   - Boundary checks: resolved paths must stay in pack directory

4. **Idempotence**
   - Running init twice produces same result
   - Safe to run in existing repos
   - Dry-run shows exact changes

### Be Flexible About (User Preferences)

Support multiple workflow styles:

- Branching model (dev→main vs main-only)
- Documentation level (minimal vs detailed)
- Verification requirements
- Protected branches

**Solution:** Multiple packs, not configurable packs.

---

## Sprint Deliverables

### 1. Pack System Core

**Leverage:** High | **Risk:** Low | **Effort:** Small (~400 LOC)

**Files Created:**
- `src/packs/loader.ts` - Load and validate pack manifests
- `src/packs/renderer.ts` - Simple `{{variable}}` template substitution
- `src/packs/actions.ts` - Execute idempotent init actions
- `src/commands/packs.ts` - List available packs

**Key Features:**
- Code-based validation (not JSON Schema)
- Clear error messages for invalid packs
- Path resolution relative to installed module (works with npm install)
- Template rendering without loops/conditionals (keep it simple)

**Implementation:**

```typescript
// Pack manifest structure (v1)
interface PackManifest {
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
```

**Testing:**
- Unit tests: loader (14), renderer (12), actions (11)
- Total: 37 unit tests

---

### 2. Security Hardening

**Leverage:** Critical | **Risk:** High if skipped | **Effort:** Small (~150 LOC)

**Threats Mitigated:**
1. **Directory traversal** - `--pack ../../../etc/passwd`
2. **Template escape** - `templates/../../evil.js`
3. **Code execution** - `.js`, `.sh`, `.exe` files in packs
4. **Path injection** - Absolute paths, `~/`, `$VAR` in templates

**Implementation:**

```typescript
// Defense in depth: sanitizePackName()
function sanitizePackName(name: string): string | null {
  // Layer 1: Regex whitelist
  if (!name.match(/^[a-z][a-z0-9-]*$/)) return null;

  // Layer 2: Path normalization check
  const normalized = path.normalize(name);
  if (normalized !== name || normalized.includes('..') || normalized.includes('/')) {
    return null;
  }

  return name;
}

// Layer 3: Boundary verification
const resolvedPackDir = path.resolve(packDir);
const resolvedPacksDir = path.resolve(packsDir);
if (!resolvedPackDir.startsWith(resolvedPacksDir + path.sep)) {
  return null;
}
```

**Testing:**
- Security suite (13 tests) in loader.test.ts
- Tests malicious pack names, template paths, path escapes
- Verifies all forbidden patterns rejected

**Documentation:**
- `docs/packs/SECURITY.md` - Security measures and validation

---

### 3. CLI Integration

**Leverage:** High | **Risk:** Low | **Effort:** Small (~100 LOC)

**Commands Added:**

```bash
# List available packs
runr packs
runr packs --verbose  # Show pack loading path

# Initialize with pack
runr init --pack solo
runr init --pack solo --dry-run  # Preview changes
runr init --pack trunk
```

**UX Improvements:**
- Bold pack names in output
- Inline usage examples
- Better help text: `--pack <name>` shows examples (solo, trunk)
- `--verbose` flag shows pack loading path for debugging

**Legacy Preservation:**
- `runr init` without `--pack` → no AGENTS.md, no CLAUDE.md
- Original behavior completely unchanged
- Zero interference with existing workflows

**Files Modified:**
- `src/cli.ts` - Added `packs` command, extended `init` options
- `src/commands/init.ts` - Load pack, apply defaults, execute actions

---

### 4. Initial Packs (solo, pr, trunk)

**Leverage:** High | **Risk:** Low | **Effort:** Small (~300 LOC + templates)

**Pack: solo (dev → main, no PR)**

```json
{
  "pack_version": 1,
  "name": "solo",
  "display_name": "Solo Dev (dev → main, no PR)",
  "description": "Fast local workflow with verified checkpoints, cherry-pick submit, and minimal docs.",
  "defaults": {
    "profile": "solo",
    "integration_branch": "dev",
    "release_branch": "main",
    "submit_strategy": "cherry-pick",
    "require_clean_tree": true,
    "require_verification": true,
    "protected_branches": ["main"]
  },
  "templates": {
    "AGENTS.md": "templates/AGENTS.md.tmpl",
    "CLAUDE.md": "templates/CLAUDE.md.tmpl",
    "bundle.md": "templates/bundle.md.tmpl"
  },
  "init_actions": [
    {
      "type": "ensure_gitignore_entry",
      "path": ".gitignore",
      "line": ".runr/"
    },
    {
      "type": "create_file_if_missing",
      "path": "AGENTS.md",
      "template": "AGENTS.md"
    },
    {
      "type": "create_file_if_missing",
      "path": "CLAUDE.md",
      "template": "CLAUDE.md",
      "when": { "flag": "with_claude" }
    }
  ]
}
```

**Pack: pr (feature → main via PR)**

```json
{
  "name": "pr",
  "display_name": "Pull Request Workflow (feature → main via PR)",
  "description": "Feature branch workflow with verified checkpoints, reviewable proof packets, and optional PR integration.",
  "defaults": {
    "profile": "pr",
    "integration_branch": "main",
    "release_branch": "main",
    "submit_strategy": "cherry-pick",
    "require_verification": true,
    "require_clean_tree": true,
    "protected_branches": ["main"]
  }
}
```

**Purpose:**
- **Most broadly useful** - PRs are default mental model for reviewable changes
- Even solo devs use PRs as personal safety/review ritual
- Maps cleanly to "proof packet" idea
- Supports team collaboration

**Pack: trunk (main only)**

```json
{
  "name": "trunk",
  "display_name": "Trunk-Based Development (main only)",
  "description": "Work directly on main with verified checkpoints. Submit is a verification gate, not a branch operation.",
  "defaults": {
    "profile": "trunk",
    "integration_branch": "main",
    "release_branch": "main",
    "submit_strategy": "cherry-pick",
    "require_clean_tree": true,
    "require_verification": true,
    "protected_branches": []
  }
}
```

**Purpose:**
- High-automation teams (trunk-based development)
- Minimal branching ceremony
- **Honest about submit:** Verification is the gate, submit is audit event
- Niche but valid workflow

**Why three packs:**
- Prove pack system isn't hardcoded
- Support different branching strategies (solo, PR, trunk)
- Lead with solo + pr (most useful for adoption)

---

### 5. Constraint Enforcement

**Leverage:** Critical | **Risk:** High if skipped | **Effort:** Small (~100 LOC)

**Problem:** Without mechanical guards, constraints will be violated over time.

**Solution:** CI tests that fail if anyone violates the pack contract.

**Tests Added (10 constraint tests):**

1. **No Smart Actions** - Only allows `ensure_gitignore_entry`, `create_file_if_missing`
2. **Rejects Forbidden Actions** - Blocks `edit_file`, `run_command`, `modify_package_json`, etc
3. **Pack Version Enforcement** - Must be `pack_version: 1`
4. **Mandatory Fields** - Requires pack_version, name, display_name, description
5. **No Unknown Keys** - Rejects unexpected top-level manifest keys
6. **Pack Name Format** - Must match `/^[a-z][a-z0-9-]*$/`
7. **Template Path Safety** - No absolute paths, no `../` escapes
8. **No Suspicious Patterns** - Blocks `../`, `~/`, `$` in template paths
9. **File Extension Whitelist** - Only `.tmpl`, `.md`, `.txt` allowed
10. **Idempotence Verification** - All actions have required fields

**Files:**
- `src/packs/__tests__/constraints.test.ts` (10 tests)

**Documentation:**
- `docs/packs/CONSTRAINTS.md` - Philosophy and hard limits for v1/v2

---

### 6. npm Packaging

**Leverage:** Critical | **Risk:** Blocker if broken | **Effort:** Tiny (~5 LOC)

**Problem:** If `packs/` doesn't ship with npm package, everything fails.

**Solution:** Add to package.json "files" field.

```json
{
  "files": [
    "dist/",
    "packs/",
    "!packs/_schema/",
    "templates/prompts/",
    "README.md"
  ]
}
```

**Path Resolution:**

```typescript
// In dist/packs/loader.js:
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packsDir = path.resolve(__dirname, '../../packs');
// Works from: npm install, npx, global install, ts-node dev mode
```

**Verification (tested 2026-01-05):**

```bash
# Local tarball
npm pack
npm install weldr-runr-0.4.0.tgz
npx runr packs  # ✅ Works

# Global install
npm install -g weldr-runr-0.4.0.tgz
runr packs  # ✅ Works
```

**Documentation:**
- `docs/packs/PACKAGING.md` - npm packaging and path resolution

---

## Architecture

### Core vs Pack Boundary

**Core (src/):** Logic + invariants
- Supervisor state machine
- Verification engine
- Worker orchestration
- Safety guarantees

**Packs (packs/):** Opinions + scaffolding + docs
- Workflow defaults
- Documentation templates
- Initialization actions
- No code, no logic

### Why This Boundary Matters

**Fast pack iteration:**
- Update templates → ship
- Adjust defaults → ship
- Add new pack → ship
- No core changes needed

**Slow core evolution:**
- Change core for correctness bugs, security, fundamental improvements only
- Packs absorb workflow churn

---

## Testing Strategy

### Unit Tests (47 tests total)

**Pack Loader (14 tests):**
- ✅ Load valid packs
- ✅ Reject invalid manifests
- ✅ Security: malicious pack names, path traversal
- ✅ Boundary verification

**Template Renderer (12 tests):**
- ✅ Basic variable substitution
- ✅ Multiple variables
- ✅ Missing variables (empty string)
- ✅ Malformed syntax (left as-is)

**Init Actions (11 tests):**
- ✅ ensure_gitignore_entry (idempotence)
- ✅ create_file_if_missing (idempotence)
- ✅ Template rendering
- ✅ Path security (template escape detection)

**Constraint Enforcement (10 tests):**
- ✅ Only allowed action types
- ✅ Reject forbidden actions
- ✅ Pack contract stability
- ✅ Template path safety
- ✅ No code execution

### Integration Tests

**Manual verification:**
- ✅ `runr packs` from local build
- ✅ `runr packs` from npm tarball install
- ✅ `runr packs` from global install
- ✅ `runr init --pack solo` creates files
- ✅ `runr init --pack solo` second time → idempotent
- ✅ `runr init` without `--pack` → legacy behavior

---

## File Inventory

### Core Implementation

```
src/packs/
├── loader.ts              # 250 LOC - Load and validate packs
├── renderer.ts            #  30 LOC - Template substitution
├── actions.ts             # 150 LOC - Execute init actions
└── __tests__/
    ├── loader.test.ts     # 14 tests - Loading + security
    ├── renderer.test.ts   # 12 tests - Template rendering
    ├── actions.test.ts    # 11 tests - Action execution
    └── constraints.test.ts # 10 tests - Contract enforcement

src/commands/
└── packs.ts               #  50 LOC - List packs command

packs/
├── solo/
│   ├── pack.json          # Solo pack manifest
│   └── templates/
│       ├── AGENTS.md.tmpl
│       ├── CLAUDE.md.tmpl
│       └── bundle.md.tmpl
├── pr/
│   ├── pack.json          # PR pack manifest
│   └── templates/
│       ├── AGENTS.md.tmpl
│       ├── CLAUDE.md.tmpl
│       └── bundle.md.tmpl
└── trunk/
    ├── pack.json          # Trunk pack manifest
    └── templates/
        ├── AGENTS.md.tmpl
        ├── CLAUDE.md.tmpl
        └── bundle.md.tmpl
```

### Documentation

```
docs/packs/
├── README.md              # Pack system overview
├── SECURITY.md            # Security measures
├── PACKAGING.md           # npm packaging + verification
├── CONSTRAINTS.md         # Philosophy and limits
└── schema/
    └── pack.schema.json   # Documentation-only JSON Schema
```

**Total:**
- Implementation: ~580 LOC
- Tests: ~470 LOC (47 tests)
- Documentation: ~600 lines

---

## Success Criteria

### Functionality
- ✅ `runr packs` lists available packs
- ✅ `runr init --pack <name>` applies pack defaults
- ✅ Pack templates render correctly with variables
- ✅ Init actions are idempotent (safe to run twice)
- ✅ Works from npm install, global install, dev mode

### Security
- ✅ Pack names cannot escape directory
- ✅ Template paths cannot escape pack directory
- ✅ No code execution from packs
- ✅ Malicious inputs rejected with clear errors

### Testing
- ✅ 47 tests passing across 4 suites
- ✅ Constraint tests mechanically enforce limits
- ✅ Security tests cover all attack vectors
- ✅ Global install verified manually

### Documentation
- ✅ README explains pack system
- ✅ SECURITY documents threat model
- ✅ PACKAGING shows verification steps
- ✅ CONSTRAINTS locks in philosophy

---

## Evolution Strategy

### Rapid Pack Iteration (No Core Changes)

Change packs freely:
- Update templates (better docs, clearer guidance)
- Adjust defaults (stricter verification, different branches)
- Add new packs (pr, feature-branch, monorepo, etc)

### Conservative Core Changes (When Needed)

Add new action types only when:
- Safe and idempotent
- Clear, limited scope
- Heavily requested

Example candidates (not committed):
- `ensure_package_script` - Add script to package.json if missing
- `create_directory_if_missing` - Scaffold directory structure

### Version Packs Separately (Future)

When needed:
- Add `pack_version: 2` schema
- Keep v1 packs working (backward compatibility)
- Clear migration path

---

## Risks Mitigated

### ✅ npm Packaging Failure
- **Threat:** Packs not included in published package
- **Mitigation:** Added to package.json "files", verified with `npm pack`
- **Verification:** Tested local tarball install + global install

### ✅ Directory Traversal Attack
- **Threat:** `--pack ../../../etc/passwd`
- **Mitigation:** Three-layer defense (regex, normalization, boundary check)
- **Verification:** Security test suite (13 tests)

### ✅ Template Path Escape
- **Threat:** Template paths like `../../evil.js`
- **Mitigation:** Path resolution + boundary verification in actions.ts
- **Verification:** Constraint tests + action security tests

### ✅ Legacy Behavior Breakage
- **Threat:** `runr init` creates unwanted files
- **Mitigation:** Pack loading only happens when `--pack` specified
- **Verification:** Manual testing + documentation

### ✅ Future Scope Creep
- **Threat:** Someone adds smart actions, plugin system, code execution
- **Mitigation:** Mechanical constraint tests that fail CI
- **Verification:** 10 constraint enforcement tests in CI

---

## Future Enhancements (Deferred)

### Not in v1

These are **explicitly out of scope** to keep v1 simple:

- ❌ Pack versioning beyond v1
- ❌ Plugin system (arbitrary code execution)
- ❌ Pack marketplace/registry
- ❌ Smart actions (edit files, run commands, git operations)
- ❌ Pack dependencies or composition
- ❌ Dynamic pack loading from URLs
- ❌ Pack configuration (packs are fixed, not parameterized)

### When to Consider (v2+)

Add new features only when:
- External users are blocked without it
- Multiple teams request same capability
- Clear security model for new features
- Backward compatible with v1

**Default answer:** "Fork a pack and maintain it yourself" or "Request new pack in core"

---

## Commits

1. **feat(packs): Implement Runr Packs v1 system** (initial implementation)
   - Pack loader, renderer, actions
   - CLI commands (packs, init --pack)
   - Unit tests (37 tests)

2. **feat(packs): Harden pack system for production** (security + packaging)
   - Path sanitization (directory traversal protection)
   - npm packaging (packs/ in files array)
   - Template path security
   - Security test suite

3. **feat(packs): Lock in product shape** (trunk pack + UX)
   - Add trunk pack (prove not solo-hardcoded)
   - Improve CLI help text
   - Better packs command output
   - Move schema to docs/ (documentation-only)

4. **feat(packs): Add mechanical constraint enforcement**
   - Constraint test suite (10 tests)
   - Global install verification
   - --verbose flag for pack loading path
   - CONSTRAINTS.md philosophy doc

---

## Lessons Learned

### What Went Well

1. **Security-first mindset** - Catching path traversal early prevented production issues
2. **Constraint enforcement** - Mechanical tests lock in philosophy
3. **Real-world verification** - Testing npm pack/install found packaging bug immediately
4. **Clear boundaries** - Core vs Pack separation makes evolution strategy obvious

### What to Remember

1. **Real-world testing is non-negotiable** - Build + unit tests ≠ "it works"
2. **Security in layers** - Defense in depth catches what single checks miss
3. **Mechanical > Manual** - Constraint tests prevent future mistakes
4. **Documentation locks in decisions** - CONSTRAINTS.md prevents scope creep

### For Next Sprint

1. Start with real-world verification plan (npm install, global install, etc)
2. Add security tests immediately (don't wait for "hardening phase")
3. Write constraint enforcement tests alongside features
4. Document philosophy early (locks in scope, prevents creep)

---

## References

- [Pack System README](../packs/README.md)
- [Pack Security Documentation](../packs/SECURITY.md)
- [Pack Packaging Guide](../packs/PACKAGING.md)
- [Pack Constraints Philosophy](../packs/CONSTRAINTS.md)
- [Pack Schema (documentation only)](../packs/schema/pack.schema.json)
