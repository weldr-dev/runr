import fs from 'node:fs';
import path from 'node:path';
import { ContextPack, estimatePackTokens } from './pack.js';

/**
 * Context pack artifact stored in runs/<id>/artifacts/context-pack.json
 */
export interface ContextPackArtifact {
  enabled: boolean;
  pack_version: 1;
  generated_at: string;
  estimated_tokens?: number;
  // Full pack data when enabled
  verification?: ContextPack['verification'];
  reference_files?: ContextPack['reference_files'];
  scope?: ContextPack['scope'];
  patterns?: ContextPack['patterns'];
}

/**
 * Write context pack artifact to run directory.
 * When pack is null, writes a disabled stub.
 */
export function writeContextPackArtifact(
  runDir: string,
  pack: ContextPack | null
): void {
  const artifactsDir = path.join(runDir, 'artifacts');

  // Ensure artifacts directory exists
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const artifactPath = path.join(artifactsDir, 'context-pack.json');

  if (pack === null) {
    // Write disabled stub
    const stub: ContextPackArtifact = {
      enabled: false,
      pack_version: 1,
      generated_at: new Date().toISOString()
    };
    fs.writeFileSync(artifactPath, JSON.stringify(stub, null, 2));
  } else {
    // Write full pack
    const artifact: ContextPackArtifact = {
      enabled: true,
      pack_version: 1,
      generated_at: pack.generated_at,
      estimated_tokens: estimatePackTokens(pack),
      verification: pack.verification,
      reference_files: pack.reference_files,
      scope: pack.scope,
      patterns: pack.patterns
    };
    fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  }
}

/**
 * Read context pack artifact from run directory.
 * Returns null if file doesn't exist (older runs).
 */
export function readContextPackArtifact(
  runDir: string
): ContextPackArtifact | null {
  const artifactPath = path.join(runDir, 'artifacts', 'context-pack.json');

  if (!fs.existsSync(artifactPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(artifactPath, 'utf-8');
    return JSON.parse(content) as ContextPackArtifact;
  } catch {
    return null;
  }
}

/**
 * Format context pack status for report output.
 */
export function formatContextPackStatus(artifact: ContextPackArtifact | null): string {
  if (artifact === null) {
    return 'context_pack: (not found)';
  }
  if (!artifact.enabled) {
    return 'context_pack: disabled';
  }
  return `context_pack: present (${artifact.estimated_tokens ?? '?'} tokens)`;
}
