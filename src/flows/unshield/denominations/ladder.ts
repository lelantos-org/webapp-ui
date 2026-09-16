// The denomination picker's data model: which shared amounts to offer, and what
// to say about the one entered.
//
// A withdrawal's gross is published on chain in circuit units, and circuit units
// do not drift, so the naive round trip — deposit 1,234.56, withdraw 1,234.56 —
// publishes the same near-unique integer at both ends and ties the two together.
// The ladder is a small table of fixed integers that many users publish, so an
// amount drawn from it is one of a crowd rather than a fingerprint. Nothing
// rejects an off-ladder withdrawal and nothing here does either; the cost is
// privacy, which is invisible unless something says so.
//
// Amounts are formatted with the webapp's `formatAmountForAsset` rather than the
// SDK's `denominationChoices`. A chip writes a decimal string into the amount
// field and `parseAmountInput` turns it back into the circuit units the
// withdrawal publishes, so the two must be exact inverses: labelling with one
// formatter and parsing with another round-trips a denomination into a number
// that is not on the ladder, the failure this module exists to prevent.
//
// On a yield asset that inverse is why `parseAmountInput` rounds up: the
// formatter floors circuit units into base units, so anything else reads a chip
// back one unit short of the rung it names. See the note there.

import { isDenomination, type Ladder, nearest, PUBLIC_IN_MAX } from "@lelantos-org/sdk/protocol";
import type { AssetMeta } from "@/features/op-form";
import {
  formatAmountForAsset,
  formatAmountForDisplay,
  formatAssetAmount,
} from "@/shared/lib/format/asset";

/// How one chip reads against the amount field.
type DenominationState =
  /// Offered, and neither entered nor recommended.
  | "plain"
  /// Exactly what the amount field holds.
  | "chosen"
  /// Where the notice steers an off-ladder amount.
  | "suggested";

export interface DenominationOption {
  /// Circuit units — exactly the gross a withdrawal for this chip publishes.
  value: bigint;
  /// What the amount field is written with. `parseAmountInput` maps it back
  /// to `value` exactly; see the note at the top of this file.
  ///
  /// Full precision: this is an amount, not a caption. Capping it would write a
  /// figure off the very rung the chip stands for, the one thing these chips
  /// exist to keep it on.
  text: string;
  /// What the chip reads on screen — `text` capped to
  /// {@link DISPLAY_FRAC_DIGITS}. A yield asset's rungs are round in circuit
  /// units and anything but round in token units, so the untruncated figure runs
  /// to 18 digits inside a button.
  label: string;
  state: DenominationState;
}

// Every string that claims the rungs are shared, in one place.
//
// A rung must never be described as shared unless it is: overstating the
// anonymity set is undetectable from inside the wallet. One flavour since SDK
// 0.32.0 — the SDK derives every ladder from the asset's own `scale` and
// `decimals`, so any wallet holding the asset arrives at the same rungs — and a
// further source that could not claim a crowd would have to reword these.

/// The field's visible label.
export const LADDER_HEADING = "Private amounts";
/// The chip fieldset's accessible name.
export const LADDER_FIELD_LABEL = "shared withdrawal denominations";
/// How one rung is referred to mid-sentence.
const NOUN = "shared denomination";
/// Standing explanation. Shown alone before anything is entered, and ahead of
/// the verdict once something is, so the line never loses the reason the chips
/// are there.
const INTRO = "Withdrawing one of these amounts publishes a figure many others publish too.";

/// The line under the chips, and the badge beside their label.
interface LadderNotice {
  tone: "ok" | "warn";
  /// Verdict on the entered amount. Absent while nothing is entered: there is a
  /// standing explanation to give, but nothing yet to judge.
  tag: string | undefined;
  text: string;
}

export interface LadderModel {
  /// Denominations to offer, ascending. Empty when none is within reach.
  options: DenominationOption[];
  /// Absent only when the asset has no ladder, which is also when `options` is
  /// empty — so a falsy notice means the whole control has nothing to render.
  notice: LadderNotice | undefined;
  /// Whether the entered amount is a shared denomination: `on`, `off`, or
  /// `undefined` when nothing is entered or the asset has no ladder.
  ///
  /// Stated here rather than read back off `notice.tone`, so the observer panel
  /// — which says what the chain will publish — cannot drift from the chips if
  /// the notice's styling ever changes.
  verdict: LadderVerdict;
}

/// See `LadderModel.verdict`.
export type LadderVerdict = "on" | "off" | undefined;

export interface LadderInputs {
  /// The asset's shared denominations, ascending. Empty for an asset without a
  /// ladder, and while the read is in flight — the two are not distinguished.
  ladder: Ladder;
  meta: AssetMeta;
  /// The entered amount, in circuit units. This is the gross the withdrawal
  /// publishes, so it is what the ladder is judged against — not a re-derived
  /// figure that could disagree with what the mutation sends.
  amount: bigint | undefined;
  /// What a single spend can cover, from `useSpendableMax`. `undefined` while
  /// unknown.
  max: bigint | undefined;
}

export function ladderModel({ ladder, meta, amount, max }: LadderInputs): LadderModel {
  const offerable = offerableDenominations(ladder, max);
  // Zero and a mid-edit field are both "nothing entered": neither is an amount
  // to have an opinion about.
  const entered = amount !== undefined && amount > 0n ? amount : undefined;

  // Membership is judged against the whole ladder, not the offerable subset. An
  // amount above what this balance can cover is still a shared denomination —
  // it is unaffordable, which `validateAmount` and the selector report, and not
  // a privacy problem this control should also complain about.
  const onLadder = entered !== undefined && isDenomination(entered, ladder);

  // Drawn from `offerable` rather than the whole ladder, so a suggestion is
  // always a chip the user can press. `nearest` rounds to whichever side is
  // closer and would otherwise routinely land above the balance — advice the
  // selector then refuses reads as advice and fails as an amount.
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

/// The denominations worth putting on screen, ascending.
///
/// Bounded by `spendableMax`, the figure the "max" button writes and the coin
/// selector honours: a chip above it would write an amount the app's own
/// selector refuses, under a label promising privacy. While that ceiling is
/// unknown the whole ladder is offered rather than none of it, matching how the
/// rest of the form treats an unresolved max.
///
/// Denominations past the `uint48` publicOut cap are dropped regardless —
/// `validateAmount` rejects them, so offering one is offering a dead button.
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

/// What to say under the chips.
///
/// Always something once the asset has a ladder, including before anything is
/// entered: the control is otherwise unexplained, and a line appearing on the
/// first keystroke grows the form and moves the submit button under the pointer.
/// The same constraint `FeeSummary` is built around.
function ladderNotice({
  ladder,
  meta,
  entered,
  onLadder,
  suggestion,
  offered,
}: NoticeInputs): LadderNotice | undefined {
  // Nothing to be on or off: the asset has no exact circuit-unit basis to build
  // a ladder from.
  if (ladder.length === 0) return undefined;

  if (entered === undefined) {
    return {
      tone: "ok",
      tag: undefined,
      text: offered > 0 ? INTRO : `This balance is below the smallest ${NOUN}.`,
    };
  }

  // Intro, then verdict: "Withdrawing one of these amounts
  // publishes a figure many others publish too. 500 USDC is a shared
  // denomination, …" — the verdict on its own reads as a claim with no reason.
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
