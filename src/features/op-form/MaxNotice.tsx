import type { SpendableMax } from "@lelantos-org/sdk/wallet";
import { formatAssetFixed } from "@/shared/lib/format/asset";
import { Notice } from "@/shared/ui/Notice";
import type { AssetMeta } from "./amount-validation";
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

/// What `MaxNotice` says when Max sits below the balance because of the circuit's
/// input cap.
///
/// Never "needs consolidating": that names a remedy the user cannot perform —
/// consolidation is automatic and invisible (`autoConsolidate: true` in
/// `sdk-adapter.ts`), and no control does it.
///
/// It also never names the mechanism. "Notes", the circuit's input arity and the
/// slot cap are all invisible to whoever is holding the balance, and a sentence
/// built on them explains one unknown with another. So the copy says only what
/// the user can act on: this is the most one transaction moves, the rest is
/// still theirs, and it resolves by itself.
export interface MaxNoticeCopy {
  /// The ceiling, as "3,180.00": two places, no symbol.
  max: string;
  /// Everything after the figure in the first sentence.
  tail: string;
  /// The reassurance line.
  follow: string;
}

export interface MaxNoticeInputs {
  spendable: SpendableMax | undefined;
  meta: AssetMeta;
  /// How the op names itself at the start of the reassurance: "Sending",
  /// "Unshielding".
  verb: string;
}

/// The notice's copy, or `undefined` when nothing is held back by the slot cap.
///
/// Only the slot cap. The other withheld causes (cooldown, reservation, dust)
/// mean "wait" rather than "this is how spending works", and `withheldHint`
/// covers them in a clause.
export function maxNoticeCopy({
  spendable,
  meta,
  verb,
}: MaxNoticeInputs): MaxNoticeCopy | undefined {
  if (!spendable || spendable.withheld.slots <= 0n) return undefined;
  return {
    max: formatAssetFixed(spendable.max, meta, 6),
    tail: " — the most you can move at once. The rest of your balance is still there.",
    follow: `${verb} raises this limit on its own, so nothing is stuck.`,
  };
}
