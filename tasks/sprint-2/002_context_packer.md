# Task: Context Packer (Smart Repo Indexing)

## Goal
Reduce worker prompt sizes by 50%+ while maintaining (or improving) success rate.
Replace "dump everything" with "retrieve what's relevant."

## North Star Metric
**Median tokens per worker call** - should drop significantly
**Success rate** - must not regress

## Success Contract

- [ ] New `RepoMap` module that indexes:
  - File tree (allowlist-scoped)
  - Exports per file (functions, classes, types)
  - Test file associations
  - Package scripts
  - Recent git hotspots (files changed in last N commits)
- [ ] Worker prompts receive compact RepoMap + 5-15 relevant snippets (not full files)
- [ ] Median worker-call tokens drop by 40%+ (measured via KPI)
- [ ] No regression in task success rate
- [ ] Index rebuilds in <2s for typical repos

## Implementation Milestones

### Milestone 1: File Tree Scanner
**Goal:** Build allowlist-scoped file tree with metadata

**Files expected:**
- `src/context/scanner.ts` - scan repo for files matching allowlist
- `src/context/types.ts` - FileNode, RepoMap types
- `src/context/index.ts` - exports

**Done checks:**
- Scans repo respecting allowlist/denylist
- Returns tree with: path, size, last modified, type (source/test/config/doc)
- Handles large repos (>1000 files) in <1s

### Milestone 2: Export Extractor
**Goal:** Extract key symbols from TypeScript/JavaScript files

**Files expected:**
- `src/context/extractor.ts` - parse exports from source files
- `src/context/types.ts` - extend with ExportInfo type

**Done checks:**
- Extracts: exported functions, classes, types, constants
- Lightweight regex-based (no full AST for speed)
- Returns signature snippets (first line of each export)

### Milestone 3: Relevance Scoring
**Goal:** Score files by relevance to current task/milestone

**Files expected:**
- `src/context/relevance.ts` - scoring algorithm
- `src/context/retriever.ts` - top-K file retrieval

**Done checks:**
- Scores based on: keyword match, path match, test association, git recency
- Returns ranked list of relevant files with snippets
- Configurable K (default 10)

### Milestone 4: Prompt Integration
**Goal:** Replace raw context with RepoMap in worker prompts

**Files expected:**
- `src/workers/prompts.ts` - update prompt builders
- `src/context/formatter.ts` - format RepoMap for prompts
- `src/supervisor/runner.ts` - pass RepoMap to prompt builders

**Done checks:**
- Prompts include compact RepoMap header
- Only relevant file snippets included (not full files)
- Token count per prompt reduced (verify via KPI)

## RepoMap Schema (draft)

```typescript
interface RepoMap {
  root: string;
  generated_at: string;

  tree: FileNode[];

  exports: {
    [filePath: string]: ExportInfo[];
  };

  tests: {
    [sourcePath: string]: string[]; // associated test files
  };

  scripts: {
    [name: string]: string; // from package.json
  };

  hotspots: string[]; // recently changed files
}

interface FileNode {
  path: string;
  type: 'source' | 'test' | 'config' | 'doc' | 'other';
  size: number;
  exports_count?: number;
}

interface ExportInfo {
  name: string;
  kind: 'function' | 'class' | 'type' | 'const' | 'interface';
  signature: string; // first line / declaration
  line: number;
}

interface RelevantFile {
  path: string;
  score: number;
  reason: string; // why it's relevant
  snippet: string; // key content (truncated)
}
```

## Prompt Format (compact)

```
## Repo Map
Root: apps/deckbuilder
Files: 24 source, 8 tests, 3 config

### Key Exports
src/engine/engine.ts: GameEngine, createGame(), playCard(), endTurn()
src/engine/types.ts: GameState, Card, Player, Enemy
src/ai/ai.ts: selectBestCard(), evaluateState()

### Relevant Files (for this milestone)
1. src/engine/engine.ts (score: 0.95) - core game logic
2. src/ai/ai.ts (score: 0.82) - AI decision making
3. src/engine/types.ts (score: 0.78) - type definitions

### File Contents
[Only the 5-10 most relevant files, truncated to key sections]
```

## Guardrails
- No external dependencies for parsing (keep it fast)
- Graceful fallback to raw context if indexing fails
- Cache RepoMap per run (don't rebuild on every call)
- Respect allowlist/denylist strictly

## Risk Level
Medium - changes prompt content, could affect worker behavior

## Validation
- Run same task with/without context packer
- Compare token usage and success rate
- A/B test on 5 representative tasks
