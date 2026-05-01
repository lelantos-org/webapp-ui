// Liveness probe for the relayer + fmd backend services.

import { useQuery } from "@tanstack/react-query";
import { env } from "@/config/env";

export type ServiceState = "up" | "down" | "unknown";

export interface SystemHealth {
  relayer: ServiceState;
  fmd: ServiceState;
}

const POLL_MS = 15_000;

export function useSystemHealth() {
  return useQuery<SystemHealth>({
    queryKey: ["system-health"],
    queryFn: async () => {
      const [relayer, fmd] = await Promise.all([
        probe(`${env.relayerUrl.replace(/\/$/, "")}/health`),
        probe(`${env.fmdUrl.replace(/\/$/, "")}/health`),
      ]);
      return { relayer, fmd };
    },
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: POLL_MS,
  });
}

async function probe(url: string): Promise<ServiceState> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return r.ok ? "up" : "down";
  } catch {
    return "down";
  }
}
