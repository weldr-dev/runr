import type { RNGState } from "./types";

export function nextInt(
  state: RNGState,
  max: number
): { value: number; rng: RNGState } {
  const nextSeed = (state.seed * 1103515245 + 12345) & 0x7fffffff;
  const value = max === 0 ? 0 : nextSeed % max;
  return { value, rng: { seed: nextSeed } };
}
