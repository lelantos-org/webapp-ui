// Centralized logger. `debug` / `info` are off (even in dev) unless
// `VITE_DEBUG=true`, `?debug=1` in the URL, or `localStorage["lelantos:debug"]="1"`.
// `warn` / `error` always fire.

type Level = "debug" | "info" | "warn" | "error";

const DEBUG_KEY = "lelantos:debug";

function readDebugFlag(): boolean {
  if (import.meta.env.VITE_DEBUG === "true" || import.meta.env.VITE_DEBUG === "1") return true;
  if (typeof window === "undefined") return false;
  try {
    const url = new URLSearchParams(window.location.search).get("debug");
    if (url === "1" || url === "true") {
      try {
        window.localStorage?.setItem(DEBUG_KEY, "1");
      } catch {
        // private mode — ignore
      }
      return true;
    }
  } catch {
    // ignore URL parse errors
  }
  try {
    return window.localStorage?.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

let debugCached: boolean | undefined;
function debugEnabled(): boolean {
  if (debugCached === undefined) debugCached = readDebugFlag();
  return debugCached;
}

/// Expose runtime toggle for ops / debugging. `window.__lelantosDebug(true)`.
if (typeof window !== "undefined") {
  (window as unknown as { __lelantosDebug?: (on: boolean) => void }).__lelantosDebug = (on) => {
    debugCached = on;
    try {
      if (on) window.localStorage?.setItem(DEBUG_KEY, "1");
      else window.localStorage?.removeItem(DEBUG_KEY);
    } catch {
      // ignore
    }
  };
}

function enabled(level: Level): boolean {
  if (level === "warn" || level === "error") return true;
  return debugEnabled();
}

function emit(level: Level, scope: string, args: unknown[]): void {
  if (!enabled(level)) return;
  const tag = `[${scope}]`;
  // biome-ignore lint/suspicious/noConsole: logger is the single sanctioned console boundary
  const fn = console[level === "debug" ? "log" : level];
  fn(tag, ...args);
}

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  child(subscope: string): Logger;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (...a) => emit("debug", scope, a),
    info: (...a) => emit("info", scope, a),
    warn: (...a) => emit("warn", scope, a),
    error: (...a) => emit("error", scope, a),
    child: (sub) => createLogger(`${scope}:${sub}`),
  };
}

/// Lets callers skip expensive log-arg construction when debug is off.
export function isDebugEnabled(): boolean {
  return debugEnabled();
}

/// Prefixes of noisy SDK / WASM-worker `console.log` lines; ungateable from
/// outside the SDK, so `console.log` is patched to drop them while debug is off.
const NOISY_PREFIXES = ["[WasmProver]", "[worker-perf]", "[rayon-main"];

let consoleFilterInstalled = false;

/// Idempotent; call once at boot. Re-evaluates the debug flag on every call
/// so the runtime toggle (`window.__lelantosDebug(true)`) applies without reload.
export function installConsoleFilter(): void {
  if (consoleFilterInstalled || typeof console === "undefined") return;
  consoleFilterInstalled = true;
  // biome-ignore lint/suspicious/noConsole: patching console.log is the point of this filter
  const orig = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    if (!debugEnabled()) {
      const head = typeof args[0] === "string" ? args[0] : "";
      if (NOISY_PREFIXES.some((p) => head.startsWith(p))) return;
    }
    orig(...args);
  };
}
