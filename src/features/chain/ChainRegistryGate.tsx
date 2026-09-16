import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ChainEntry } from "@/config/chains";

/// What the app shows in place of itself while there is no chain registry to
/// run on.
export function ChainRegistryGate({
  query,
  registry,
  children,
}: {
  query: UseQueryResult<ChainEntry[]>;
  /// The registry as the provider reads it: the query's data, or empty.
  registry: ChainEntry[];
  children: ReactNode;
}) {
  // Gated on the registry rather than the wallet: without it nothing can
  // distinguish a supported chain from an unsupported one. With a cached
  // registry `isPending` is already false, so this spinner appears only on a
  // browser that has never reached the registry services.
  if (query.isPending) return <ChainNotice>loading chains…</ChainNotice>;

  // The two failure notices are gated on having no registry at all rather than
  // on the query's status. A revalidation failing behind a cached registry must
  // not replace a working app with an error screen: the cached chains remain
  // correct, and a service that is down surfaces in `HealthIndicator` and again
  // at the first action needing it.
  if (registry.length === 0) {
    // Unreachable and empty are distinct: `loadChainRegistry` throws for the
    // former and resolves `[]` for the latter, so a 502 is not reported as an
    // empty registry and the retry below has something to act on.
    if (query.error) {
      return (
        <ChainNotice tone="err" onRetry={() => void query.refetch()}>
          Could not reach the relayer to find out which networks are available.{" "}
          {query.error.message}
        </ChainNotice>
      );
    }
    return (
      <ChainNotice tone="err" onRetry={() => void query.refetch()}>
        The relayer is not serving any network this app can use.
      </ChainNotice>
    );
  }
  return <>{children}</>;
}

/// Stands in for the entire app while the registry is unavailable, with enough
/// layout not to read as a rendering failure.
function ChainNotice({
  children,
  tone,
  onRetry,
}: {
  children: ReactNode;
  tone?: "err";
  onRetry?: () => void;
}) {
  return (
    <div className="main">
      <div className={tone === "err" ? "err" : "muted txt-sm"}>{children}</div>
      {onRetry ? (
        <button type="button" className="btn mt-8" onClick={onRetry}>
          try again
        </button>
      ) : null}
    </div>
  );
}
