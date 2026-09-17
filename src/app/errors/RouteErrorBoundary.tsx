import { type ReactNode, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { rawMessage, userMessage } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";
import { SESSION_KEYS } from "@/shared/lib/storage/keys";
import { sessionStore } from "@/shared/lib/storage/safe";
import { ErrorBoundary } from "./ErrorBoundary";
import { ErrorCard } from "./ErrorCard";

const log = createLogger("route-boundary");

/// Set once a chunk-error reload was tried, so a truly missing chunk cannot reload forever.
const RELOADED_KEY = SESSION_KEYS.chunkReload;

/// True for a `React.lazy` stale-chunk failure; matched on text, which differs per engine.
function isChunkLoadError(error: unknown): boolean {
  const msg = rawMessage(error);
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /ChunkLoadError/i.test(msg)
  );
}

function alreadyReloaded(): boolean {
  return sessionStore.get(RELOADED_KEY) !== undefined;
}

function markReloaded(): void {
  sessionStore.set(RELOADED_KEY, "1");
}

/// Error boundary for the route tree: reloads once for a stale chunk, and clears on navigation.
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
          <ErrorCard title="This page failed to load">
            <div className="err">{userMessage(error)}</div>
            <div className="row">
              <button type="button" className="btn" onClick={reset}>
                try again
              </button>
              <button type="button" className="btn" onClick={() => window.location.reload()}>
                reload
              </button>
            </div>
          </ErrorCard>
        );
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

// In an effect, not render: StrictMode's discarded render would spend the single retry.
function ChunkReload({ error }: { error: unknown }) {
  useEffect(() => {
    log.info("stale route chunk; reloading once", error);
    markReloaded();
    window.location.reload();
  }, [error]);
  return null;
}
