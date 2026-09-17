import { useQuery } from "@tanstack/react-query";
import { usePolling } from "@/shared/query/cadence";
import { queryKeys } from "@/shared/query/keys";
import { MONITORED, SERVICE_NAMES, type ServiceState, type SystemHealth } from "./health";

const POLL_MS = 15_000;

const PROBE_TIMEOUT_MS = 3_000;

/// Polls every monitored backend service for reachability.
export function useSystemHealth() {
  return useQuery<SystemHealth>({
    queryKey: queryKeys.systemHealth(),
    queryFn: probeAll,
    ...usePolling(POLL_MS),
    staleTime: POLL_MS,
  });
}

async function probeAll(): Promise<SystemHealth> {
  const probed = await Promise.all(
    SERVICE_NAMES.map(async (name) => [name, await probe(MONITORED[name])] as const),
  );
  return Object.fromEntries(probed) as SystemHealth;
}

async function probe(base: string): Promise<ServiceState> {
  try {
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return r.ok ? "up" : "down";
  } catch {
    return "down";
  }
}
