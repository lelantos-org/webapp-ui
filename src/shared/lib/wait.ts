/// Resolves after `ms`, or as soon as `signal` aborts.
///
/// Resolves rather than rejects on abort, so callers must re-check
/// `signal.aborted` afterwards. `{ once: true }` keeps an abandoned wait from
/// retaining its listener on a long-lived signal.
export function waitWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        resolve();
      },
      { once: true },
    );
  });
}
