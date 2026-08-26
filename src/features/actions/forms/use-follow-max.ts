// Keep a maxed-out amount field in step with a max that moves under it.
//
// The ceiling is not a constant. Switching the relayer's fee asset to one the
// spend is not already moving costs an input slot — `prepareSpend` passes
// `nIn - 1` — so the most that can be sent drops the moment the picker
// changes. A figure written before that change is one the selector will refuse,
// reported as `insufficient cover` against a number the app itself wrote.
//
// Only the value *this* wrote is rewritten. An amount the user typed is left
// alone even when it is now too large: validation already marks it, and
// silently editing what someone typed is worse than showing them it is wrong.

import { useEffect, useRef } from "react";
import { type AssetMeta, formatBalance } from "./amount-field";

export interface FollowMax {
  /// Pass to `AmountField.onSetMax` in place of `setAmount`.
  onSetMax(formatted: string): void;
}

export function useFollowMax(
  max: bigint | undefined,
  selected: AssetMeta | undefined,
  /// The field's current text, to tell "still holds our figure" from "edited".
  current: string,
  setAmount: (formatted: string) => void,
): FollowMax {
  // What the max button last wrote. A ref, not state: it is a record of a past
  // render's output, and mirroring it into state would re-render on its own.
  const written = useRef<string | undefined>(undefined);

  const onSetMax = (formatted: string) => {
    written.current = formatted;
    setAmount(formatted);
  };

  useEffect(() => {
    if (max === undefined || !selected) return;
    // Untouched since we wrote it, or the user has moved on — either way there
    // is nothing of ours to correct.
    if (written.current === undefined || current !== written.current) return;

    const next = formatBalance(max, selected);
    if (next === written.current) return;
    written.current = next;
    setAmount(next);
  }, [max, selected, current, setAmount]);

  return { onSetMax };
}
