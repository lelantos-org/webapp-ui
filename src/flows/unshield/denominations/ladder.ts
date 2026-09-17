import { isDenomination, type Ladder, nearest, PUBLIC_IN_MAX } from "@lelantos-org/sdk/protocol";
import type { AssetMeta } from "@/features/op-form";
import {
  formatAmountForAsset,
  formatAmountForDisplay,
  formatAssetAmount,
} from "@/shared/lib/format/asset";

type DenominationState = "plain" | "chosen" | "suggested";

/// One denomination chip.
export interface DenominationOption {
  /// Circuit units: exactly the gross a withdrawal for this chip publishes.
  value: bigint;
  /// Full-precision amount written to the field; `parseAmountInput` must map it back to `value` exactly.
  text: string;
  /// `text` capped for display on the chip.
  label: string;
  state: DenominationState;
}

// Never call a rung shared unless it is: overstating the anonymity set is undetectable from inside the wallet.

/// The field's visible label.
export const LADDER_HEADING = "Private amounts";
/// The chip fieldset's accessible name.
export const LADDER_FIELD_LABEL = "shared withdrawal denominations";
const NOUN = "shared denomination";
const INTRO = "Withdrawing one of these amounts publishes a figure many others publish too.";

interface LadderNotice {
  tone: "ok" | "warn";
  /// Verdict on the entered amount; absent while nothing is entered.
  tag: string | undefined;
  text: string;
}

/// The denomination picker's chips, notice and verdict.
export interface LadderModel {
  /// Ascending; empty when none is within reach.
  options: DenominationOption[];
  /// Absent only when the asset has no ladder, so falsy means render nothing.
  notice: LadderNotice | undefined;
  /// Whether the entered amount is a shared denomination; `undefined` when nothing to judge.
  verdict: LadderVerdict;
}

/// `on`, `off`, or nothing to judge.
export type LadderVerdict = "on" | "off" | undefined;

/// What `ladderModel` reads.
export interface LadderInputs {
  /// Ascending; empty for an asset without a ladder and while the read is in flight.
  ladder: Ladder;
  meta: AssetMeta;
  /// The entered gross, in circuit units.
  amount: bigint | undefined;
  /// What a single spend can cover; `undefined` while unknown.
  max: bigint | undefined;
}

/// The chips to offer and what to say about the entered amount.
export function ladderModel({ ladder, meta, amount, max }: LadderInputs): LadderModel {
  const offerable = offerableDenominations(ladder, max);
  const entered = amount !== undefined && amount > 0n ? amount : undefined;

  // Judged against the whole ladder: an unaffordable rung is still shared.
  const onLadder = entered !== undefined && isDenomination(entered, ladder);

  // From `offerable`, so the suggestion is always a chip the user can press.
  const suggestion = entered !== undefined && !onLadder ? nearest(entered, offerable) : undefined;

  return {
    options: offerable.map((value) => ({
      value,
      text: formatAmountForAsset(value, meta),
      label: formatAmountForDisplay(value, meta),
      state: stateOf(value, entered, suggestion),
    })),
    verdict: ladder.length === 0 || entered === undefined ? undefined : onLadder ? "on" : "off",
    notice: ladderNotice({
      ladder,
      meta,
      entered,
      onLadder,
      suggestion,
      offered: offerable.length,
    }),
  };
}

/// Denominations within the spendable max and the publicOut cap; the whole ladder while max is unknown.
function offerableDenominations(ladder: Ladder, max: bigint | undefined): bigint[] {
  return ladder.filter((d) => d <= PUBLIC_IN_MAX && (max === undefined || d <= max));
}

function stateOf(
  value: bigint,
  entered: bigint | undefined,
  suggestion: bigint | undefined,
): DenominationState {
  if (value === entered) return "chosen";
  if (value === suggestion) return "suggested";
  return "plain";
}

interface NoticeInputs {
  ladder: Ladder;
  meta: AssetMeta;
  entered: bigint | undefined;
  onLadder: boolean;
  suggestion: bigint | undefined;
  offered: number;
}

/// The line under the chips, standing from the start so it never grows the form under the pointer.
function ladderNotice({
  ladder,
  meta,
  entered,
  onLadder,
  suggestion,
  offered,
}: NoticeInputs): LadderNotice | undefined {
  if (ladder.length === 0) return undefined;

  if (entered === undefined) {
    return {
      tone: "ok",
      tag: undefined,
      text: offered > 0 ? INTRO : `This balance is below the smallest ${NOUN}.`,
    };
  }

  if (onLadder) {
    return {
      tone: "ok",
      tag: "blends in",
      text: `${INTRO} ${formatAssetAmount(entered, meta)} is a ${NOUN}, so this withdrawal looks like every other one for it.`,
    };
  }

  const lead = `${formatAssetAmount(entered, meta)} is published on chain as entered, which links this withdrawal to whatever funded it.`;
  return {
    tone: "warn",
    tag: "stands out",
    text:
      suggestion === undefined
        ? `${INTRO} ${lead} No ${NOUN} fits what this balance can cover.`
        : `${INTRO} ${lead} Withdraw ${formatAssetAmount(suggestion, meta)} instead.`,
  };
}
