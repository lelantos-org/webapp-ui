import { type ReactNode, useEffect } from "react";
import { useLocation } from "react-router-dom";
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
///
/// Navigating away clears a latched error. `<Routes>` lives inside this
/// boundary: without that, a failed `/swap` chunk kept the error card on screen
/// after the user clicked "transfer" — the URL changed and the page did not.
/// The fallback's own `reset()` cannot fix it either, since it re-renders the
/// very subtree that threw.
///
/// This is `resetKey`, not `key`. Keying the boundary on the location also
/// worked, but it remounted everything below it on *every* navigation — so
/// switching tabs tore down `HomeLayout`, replaying its entrance animation,
/// re-firing the route `<Suspense>` fallback and refetching balances. The whole
/// page blinked on each tab click. `resetKey` drops only the error.
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
/// The reload used to run inline in the fallback's render. React 18's
/// StrictMode double-invokes render and throws the first result away, so the
/// discarded pass still wrote the `alreadyReloaded` flag — spending the single
/// retry the guard exists to ration. Side effects belong after commit.
function ChunkReload({ error }: { error: unknown }) {
  useEffect(() => {
    log.info("stale route chunk; reloading once", error);
    markReloaded();
    window.location.reload();
  }, [error]);
  return null;
}
