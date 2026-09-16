/// Run `task` once the browser is idle — `requestIdleCallback` where it exists,
/// the next macrotask where it does not (Safari). Returns a function that cancels
/// it if it has not run yet.
export function whenIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(task);
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(task, 0);
  return () => clearTimeout(id);
}
