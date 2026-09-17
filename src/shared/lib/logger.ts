import { LOCAL_KEYS } from "@/shared/lib/storage/keys";

type Level = "debug" | "info" | "warn" | "error";

const DEBUG_KEY = LOCAL_KEYS.debug;

function readDebugFlag(): boolean {
  if (import.meta.env.VITE_DEBUG === "true" || import.meta.env.VITE_DEBUG === "1") return true;
  if (typeof window === "undefined") return false;
  try {
    const url = new URLSearchParams(window.location.search).get("debug");
    if (url === "1" || url === "true") return true;
  } catch {
    // ignore URL parse errors
  }
  // Not via `shared/lib/storage`: that logs through this module, an import cycle.
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

// Runtime toggle: `window.__lelantosDebug(true)`.
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

/// Scoped logger; `debug`/`info` fire only with the debug flag, `warn`/`error` always.
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

/// SDK and WASM-worker `console.log` prefixes dropped while debug is off.
const NOISY_PREFIXES = ["[WasmProver]", "[worker-perf]", "[rayon-main"];

let consoleFilterInstalled = false;

/// Patch `console.log` to drop noisy SDK lines unless debugging. Idempotent; call once at boot.
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
