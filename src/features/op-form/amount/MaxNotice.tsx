import type { SpendableMax } from "@lelantos-org/sdk";
import { Notice } from "@/shared/ui/Notice";
import type { AssetMeta } from "./amount-validation";
import { maxNoticeCopy } from "./balance-hint";
import "./MaxNotice.css";

export interface MaxNoticeProps {
  spendable: SpendableMax | undefined;
  meta: AssetMeta;
  /// "Sending" on Send, "Unshielding" on Unshield.
  verb: string;
}

/// Why Max is below the balance, when the circuit's input cap is the reason.
/// Renders nothing otherwise.
///
/// A neutral note, not a warning: nothing is wrong and nothing is asked of the
/// user. See `maxNoticeCopy` for why the copy avoids "consolidate".
export function MaxNotice({ spendable, meta, verb }: MaxNoticeProps) {
  const copy = maxNoticeCopy({ spendable, meta, verb });
  if (!copy) return null;
  return (
    // Not announced: it arrives with the ceiling, alongside the balance row it
    // explains, and is page content rather than an event.
    <Notice tone="neutral" announce={false} className="maxnote">
      <span className="maxnote__lead">
        Max is <span className="mono">{copy.max}</span>
        {copy.tail}
      </span>
      <span className="maxnote__follow">{copy.follow}</span>
    </Notice>
  );
}
