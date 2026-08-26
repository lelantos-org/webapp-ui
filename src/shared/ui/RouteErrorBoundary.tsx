import { type ReactNode, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { describeError } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";
import { ErrorBoundary } from "@/shared/ui/ErrorBoundary";

const log = createLogger("route-boundary");

/// Session key marking that a reload was already attempted for a chunk error.
/// Without it, a chunk that is genuinely missing — a bad deploy rather than a
/// stale one — would reload indefinitely.
const RELOADED_KEY = "lelantos:chunk-reload";

/// True for the failure a `React.lazy` import throws when its hashed chunk is
/// no longer on the server.
///
/// Matched on message text because there is no typed error: browsers report a
/// dynamic-import failure as a plain `TypeError`, worded differently per engine.
function isChunkLoadError(error: unknown): boolean {
  const msg = describeError(error);
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
    // Private mode with storage disabled. The guard is best-effort, and failing
    // open costs one extra reload attempt.
  }
}

/// Error boundary for the lazy route tree.
///
/// Mounted inside `BrowserRouter`, around `<Suspense>`. The app-level
/// `ErrorBoundary` sits above the router, so a route chunk failing there blanks
/// the whole app, and its `reset()` re-renders the tree that threw. Scoping a
/// boundary to the routes keeps the layout and navigation alive.
///
/// A stale chunk after a deploy is the common case and is fixed by reloading
/// once, automatically.
///
/// Navigating away clears a latched error, which requires `<Routes>` to live
/// inside this boundary; otherwise a failed chunk keeps the error card on screen
/// after the user navigates elsewhere, and the fallback's `reset()` cannot help,
/// since it re-renders the subtree that threw.
///
/// Uses `resetKey` rather than `key`. Keying the boundary on the location would
/// remount everything below it on every navigation, tearing down `HomeLayout`,
/// replaying its entrance animation, re-firing the route `<Suspense>` fallback
/// and refetching balances. `resetKey` drops only the error.
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { key } = useLocation();
  return (
    <ErrorBoundary
      resetKey={key}
      fallback={({ error, reset }) => {
        if (isChunkLoadError(error) && !alreadyReloaded()) {
          return <ChunkReload error={error} />;
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

/// Reloads once for a stale chunk, from an effect.
///
/// Not inline in the fallback's render: StrictMode double-invokes render and
/// discards the first result, so a discarded pass would still write the
/// `alreadyReloaded` flag and spend the single retry the guard rations.
function ChunkReload({ error }: { error: unknown }) {
  useEffect(() => {
    log.info("stale route chunk; reloading once", error);
    markReloaded();
    window.location.reload();
  }, [error]);
  return null;
}
