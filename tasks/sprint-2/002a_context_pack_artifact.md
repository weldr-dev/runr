# Task 002a: Context Pack Artifact Persistence + Report Visibility

Persist context pack to run artifacts and expose in report output.

## Background

Context pack is currently built and injected into IMPLEMENT prompts when `CONTEXT_PACK=1`, but it's not persisted. This makes it impossible to:
- Inspect what context an agent actually received
- Compare context packs across runs
- Debug prompt quality issues

## Requirements

### 1. Persist context pack to artifacts

When context pack is enabled and built, write to `runs/<id>/artifacts/context-pack.json`:

```json
{
  "enabled": true,
  "pack_version": 1,
  "generated_at": "2025-12-24T01:56:50.524Z",
  "estimated_tokens": 493,
  "verification": { ... },
  "reference_files": [ ... ],
  "scope": { ... },
  "patterns": { ... }
}
```

When disabled, write stub:
```json
{
  "enabled": false,
  "pack_version": 1,
  "generated_at": "2025-12-24T01:56:50.524Z"
}
```

### 2. Report visibility

`pnpm run report <id>` should show:
- `context_pack: present (493 tokens)` when enabled
- `context_pack: disabled` when stub
- `context_pack: (not found)` for older runs without the artifact

### 3. Export helper for writing

Create `src/context/artifact.ts` with:
- `writeContextPackArtifact(runDir: string, pack: ContextPack | null): void`
- `readContextPackArtifact(runDir: string): ContextPackArtifact | null`

## Files to modify

- `src/context/artifact.ts` (new)
- `src/context/index.ts` (re-export)
- `src/commands/report.ts` (add context_pack line)

## Files NOT to modify

- `src/supervisor/**` (denylist)
- `src/workers/**` (denylist)

## Tests required

1. `writeContextPackArtifact` writes JSON to correct path
2. `writeContextPackArtifact` with null pack writes disabled stub
3. `readContextPackArtifact` returns null for missing file
4. `readContextPackArtifact` parses existing artifact
5. Report handles missing context-pack.json gracefully

## Success criteria

- `pnpm build` passes
- `pnpm test` passes
- New tests cover artifact read/write
- Report shows context_pack line without crashing on old runs
