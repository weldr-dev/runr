import { execa } from 'execa';

export async function git(
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string }>
{
  const result = await execa('git', args, { cwd });
  return { stdout: result.stdout, stderr: result.stderr };
}

export async function gitOptional(
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string } | null>
{
  try {
    return await git(args, cwd);
  } catch {
    return null;
  }
}
