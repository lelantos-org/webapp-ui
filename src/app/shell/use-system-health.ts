// Liveness probe for the backend services a session depends on.
//
// The registry is among them because it is a boot dependency: the app reads its
// `/v1/chains` and `/v1/assets` to know what a chain is at all, so a registry
// that is down means a cold load has no network to offer — a state worth
// showing rather than leaving to look like a relayer fault.
//
// The set itself lives in `health.ts`, so this module is only the query.

import { useQuery } from "@tanstack/react-query";
import { usePolling } from "@/shared/query/cadence";
import { queryKeys } from "@/shared/query/keys";
import { MONITORED, SERVICE_NAMES, type ServiceState, type SystemHealth } from "./health";

const POLL_MS = 15_000;

/// Bound on one probe. Short: this answers "is it reachable", and a service
/// slow enough to miss this is not one a session can be run against anyway.
const PROBE_TIMEOUT_MS = 3_000;

export function useSystemHealth() {
  return useQuery<SystemHealth>({
    queryKey: queryKeys.systemHealth(),
    queryFn: probeAll,
    // Covers both an unattended tab (idle factor) and a hidden one.
    ...usePolling(POLL_MS),
    staleTime: POLL_MS,
  });
}

/// Every service at once: they are independent, and probing in sequence would
/// make the reported state as stale as the slowest one.
///
/// Each name is carried alongside its own result rather than correlated by
/// index, so the two cannot be zipped back together wrongly.
///
/// The one assertion is on `Object.fromEntries`, which types its result as
/// `Record<string, T>` whatever it was given. Narrowing it back to the union the
/// entries were literally built from is sound here, and the alternative — an
/// object literal naming the three services — is the duplication `SERVICE_NAMES`
/// exists to remove.
async function probeAll(): Promise<SystemHealth> {
  const probed = await Promise.all(
    SERVICE_NAMES.map(async (name) => [name, await probe(MONITORED[name])] as const),
  );
  return Object.fromEntries(probed) as SystemHealth;
}

/// Reachability only. Any failure — a refusal, a timeout, a 5xx — is `down`:
/// the distinction between them matters to an operator reading logs, not to a
/// wallet deciding whether to warn.
async function probe(base: string): Promise<ServiceState> {
  try {
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return r.ok ? "up" : "down";
  } catch {
    return "down";
  }
}
