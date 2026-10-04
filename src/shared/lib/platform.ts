/// Whether this is a phone or tablet browser, where a wallet app has no way to inject a provider.
export function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
  // iPadOS reports a desktop Mac; only its touch points give it away.
  return /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
}

/// Whether the user asked the browser to spare their connection (Chromium's data saver).
export function savesData(): boolean {
  if (typeof navigator === "undefined") return false;
  const { connection } = navigator as Navigator & { connection?: { saveData?: boolean } };
  return connection?.saveData === true;
}

/// Whether the page may run wasm on several threads: that takes `SharedArrayBuffer`, which a
/// page has only when cross-origin isolated. A wallet app's built-in browser may not grant it,
/// and the prover then runs on one thread.
export function hasWasmThreads(): boolean {
  return typeof crossOriginIsolated === "undefined" || crossOriginIsolated;
}
