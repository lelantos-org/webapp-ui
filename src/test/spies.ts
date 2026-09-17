import type { Mock } from "vitest";

// biome-ignore lint/suspicious/noExplicitAny: matches any spy's argument list
type AnyFn = (...args: any[]) => any;

/// An argument (the first by default) of the spy's latest call; throws if it was never called.
export function lastArg<F extends AnyFn, I extends number = 0>(
  spy: Mock<F>,
  index: I = 0 as I,
): Parameters<F>[I] {
  const call = spy.mock.lastCall;
  if (!call) throw new Error(`${spy.getMockName()} was never called`);
  return call[index];
}
