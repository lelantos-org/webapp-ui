import { useEffect, useState } from "react";
import { etaText, readProveSamples } from "./prove-eta";

const TICK_MS = 1_000;

/// Time-left text for a proof started at `startedAt`, or `undefined` if none runs or no samples exist.
export function useProveEta(startedAt: number | undefined): string | undefined {
  const [now, setNow] = useState(() => Date.now());
  const [samples, setSamples] = useState<number[]>([]);

  useEffect(() => {
    if (startedAt === undefined) return;
    setSamples(readProveSamples());
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [startedAt]);

  return startedAt === undefined ? undefined : etaText(samples, Math.max(0, now - startedAt));
}
