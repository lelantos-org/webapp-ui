import type { ReactNode } from "react";
import { describeError } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";
import { ErrorBoundary } from "@/shared/ui/ErrorBoundary";

const log = createLogger("route-boundary");

/// Session key marking that a reload was already attempted for a chunk error.
/// Without it a chunk that is genuinely missing — a bad deploy rather than a
/// stale one — would reload forever.
const RELOADED_KEY = "lelantos:chunk-reload";

/// True for the failure a `React.lazy` import throws when its hashed chunk is
/// no longer on the server.
///
/// Matched on message text because there is no typed error for it: browsers
/// report a dynamic-import failure as a plain `TypeError`, with wording that
/// differs per engine.
function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /ChunkLoadError/i.test(msg)
  );
}

function alreadyReloaded(): boolean {
  try {
    return sessionStorage.getItem(RELOADED_KEY) !== null;
  } catch {
    return false;
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOADED_KEY, "1");
  } catch {
    // Private mode with storage disabled: the guard is best-effort, and
    // failing open here only costs one extra reload attempt.
  }
}

/// Error boundary for the lazy route tree.
///
/// Mounted *inside* `BrowserRouter`, around `<Suspense>`. The app-level
/// `ErrorBoundary` sits above the router, so a route chunk failing there blanks
/// the entire app — and its `reset()` re-renders the same tree that just threw,
/// so the fallback's "try again" cannot recover. Scoping a boundary to the
/// routes keeps the layout and navigation alive.
///
/// A stale chunk after a deploy is the common case and is fixed by a reload,
/// so that is done once, automatically.
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={({ error, reset }) => {
        if (isChunkLoadError(error) && !alreadyReloaded()) {
          log.info("stale route chunk; reloading once", error);
          markReloaded();
          window.location.reload();
          return null;
        }
        return (
          <div className="card m-5">
            <div className="card__hdr">
              <h3 className="card__t">this page failed to load</h3>
            </div>
            <div className="stack stack--md">
              <div className="err">{describeError(error)}</div>
              <div className="row gap-2">
                <button type="button" className="btn" onClick={reset}>
                  try again
                </button>
                <button type="button" className="btn" onClick={() => window.location.reload()}>
                  reload
                </button>
              </div>
            </div>
          </div>
        );
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
