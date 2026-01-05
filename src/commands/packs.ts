import { loadAllPacks } from '../packs/loader.js';

/**
 * List available packs
 */
export async function packsCommand(): Promise<void> {
  const packs = loadAllPacks();

  if (packs.length === 0) {
    console.log('No packs found.');
    console.log('');
    console.log('Packs are workflow presets that provide:');
    console.log('  • Default configuration (branches, verification)');
    console.log('  • Documentation templates (AGENTS.md, CLAUDE.md)');
    console.log('  • Idempotent initialization actions');
    return;
  }

  const validPacks = packs.filter(p => p.validation.valid);
  const invalidPacks = packs.filter(p => !p.validation.valid);

  console.log('Available workflow packs:\n');

  // Display valid packs
  for (const pack of validPacks) {
    console.log(`  \x1b[1m${pack.name}\x1b[0m`);
    console.log(`    ${pack.manifest.description}`);
    console.log('');
  }

  if (validPacks.length > 0) {
    console.log('Usage:');
    console.log(`  runr init --pack <name>           # Initialize with pack`);
    console.log(`  runr init --pack solo --dry-run   # Preview changes`);
    console.log('');
  }

  // Display invalid packs
  if (invalidPacks.length > 0) {
    console.log('\x1b[33mInvalid packs:\x1b[0m\n');
    for (const pack of invalidPacks) {
      console.log(`  ${pack.name}`);
      for (const error of pack.validation.errors) {
        console.log(`    ❌ ${error}`);
      }
      console.log('');
    }
  }
}
