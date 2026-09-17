import { useEffect, useRef } from "react";
import { formatAmountForAsset } from "@/shared/lib/format/asset";
import type { AssetMeta } from "./amount-validation";

interface FollowMax {
  onSetMax(formatted: string): void;
}

/// Keeps an amount written by Max in step with a moving max; typed amounts are left alone.
export function useFollowMax(
  max: bigint | undefined,
  selected: AssetMeta | undefined,
  current: string,
  setAmount: (formatted: string) => void,
): FollowMax {
  const written = useRef<string | undefined>(undefined);

  const onSetMax = (formatted: string) => {
    written.current = formatted;
    setAmount(formatted);
  };

  useEffect(() => {
    if (max === undefined || !selected) return;
    if (written.current === undefined || current !== written.current) return;

    const next = formatAmountForAsset(max, selected);
    if (next === written.current) return;
    written.current = next;
    setAmount(next);
  }, [max, selected, current, setAmount]);

  return { onSetMax };
}
