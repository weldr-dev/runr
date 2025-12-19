import { execa } from 'execa';
import { VerifyResult, VerificationTier } from '../types/schemas.js';

export async function runVerification(
  tier: VerificationTier,
  commands: string[],
  cwd: string,
  timeoutSeconds: number
): Promise<VerifyResult> {
  const started = Date.now();
  let output = '';
  let ok = true;

  for (const command of commands) {
    try {
      const result = await execa(command, {
        cwd,
        shell: true,
        timeout: timeoutSeconds * 1000,
        all: true
      });
      output += result.all ? `${result.all}\n` : '';
    } catch (error) {
      ok = false;
      if (error instanceof Error) {
        output += `${error.message}\n`;
      }
      break;
    }
  }

  return {
    tier,
    commands,
    ok,
    duration_ms: Date.now() - started,
    output
  };
}
