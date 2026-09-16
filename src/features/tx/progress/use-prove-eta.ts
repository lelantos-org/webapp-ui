// The progress card's "about 20 seconds left", ticking while a proof runs.

import { useEffect, useState } from "react";
import { etaText, readProveSamples } from "./prove-eta";

/// Tick interval. A second is the finest the text can change at; it rounds to
/// five-second steps anyway.
const TICK_MS = 1_000;

/// The estimate for a proof that started at `startedAt`, or `undefined` when no
/// proof is running or this device has not built one before.
///
/// Samples are read once per proof rather than per tick: the proof in flight is
/// the only one that could add a sample, and it records only when it ends.
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
