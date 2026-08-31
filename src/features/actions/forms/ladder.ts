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
// SDK's `denominationChoices`, deliberately. A chip writes a decimal string into
// the amount field, `parseAmountForAsset` turns it back into the circuit units
// the withdrawal publishes, and the SDK's formatter applies the pool's yield
// index where the webapp's does not. Labelling with one formatter and parsing
// with the other would round-trip a denomination into a number that is not on
// the ladder — the exact failure this module exists to prevent. One formatter on
// both ends is what makes a chip's promise true.

import { isDenomination, type Ladder, nearest } from "@lelantos-org/sdk/core";
import { exceedsPublicInLimit, formatAmountForAsset, formatAssetAmount } from "@/shared/lib/format";
import type { AssetMeta } from "./amount-field";

/// Where the offered denominations came from, which decides what may be claimed
/// for them.
///
/// One case since SDK 0.32.0. The ladder used to come either from a six-entry
/// table of mainnet addresses or from a ladder this app generated for the assets
/// that table omitted, and only the former could be called shared. The SDK now
/// derives every ladder from the asset's own `scale` and `decimals`, so any
/// wallet holding the asset arrives at the same rungs and there is no longer a
/// table to be absent from — the "round amounts" phrasing had nothing left to
/// describe. Kept as a named type rather than inlined: what may be claimed for a
/// rung depends on where it came from, and a future source would land here.
export type LadderSource = "shared";

/// How one chip reads against the amount field.
export type DenominationState =
  /// Offered, and neither entered nor recommended.
  | "plain"
  /// Exactly what the amount field holds.
  | "chosen"
  /// Where the notice steers an off-ladder amount.
  | "suggested";

export interface DenominationOption {
  /// Circuit units — exactly the gross a withdrawal for this chip publishes.
  value: bigint;
  /// What the amount field is written with. `parseAmountForAsset` maps it back
  /// to `value` exactly; see the note at the top of this file.
  text: string;
  state: DenominationState;
}

/// Every string whose truth depends on where the ladder came from, in one
/// place.
///
/// A generated rung must never be described as shared: its anonymity set is
/// whatever this app's own users give it, not the pool-wide crowd the built-in
/// table describes, and overstating that is the failure `denominations.ts` calls
/// undetectable from inside the wallet. Branching on `source` at each phrase put
/// that guarantee in six places and one of them — the fieldset's accessible
/// name — had already drifted into the component. One table keyed by source is
/// the whole contract, readable at a glance.
interface LadderCopy {
  /// The field's visible label.
  heading: string;
  /// The fieldset's accessible name.
  fieldLabel: string;
  /// How one rung is referred to mid-sentence.
  noun: string;
  /// Standing explanation, shown before anything is entered.
  intro: string;
  /// Badge for an amount that is on the ladder.
  okTag: string;
  /// Verdict on an amount that is on the ladder.
  onLadder(amount: string): string;
}

const COPY: Record<LadderSource, LadderCopy> = {
  shared: {
    heading: "private amounts",
    fieldLabel: "shared withdrawal denominations",
    noun: "shared denomination",
    intro: "Withdrawing one of these amounts publishes a figure many others publish too.",
    okTag: "blends in",
    onLadder: (amount) =>
      `${amount} is a shared denomination, so this withdrawal looks like every other one for it.`,
  },
};

/// The line under the chips, and the badge beside their label.
export interface LadderNotice {
  tone: "ok" | "warn";
  /// Verdict on the entered amount. Absent while nothing is entered: there is a
  /// standing explanation to give, but nothing yet to judge.
  tag: string | undefined;
  text: string;
}

export interface LadderModel {
  /// Denominations to offer, ascending. Empty when none is within reach.
  options: DenominationOption[];
  /// Which table the options came from.
  source: LadderSource;
  /// The field's heading, phrased for `source`.
  heading: string;
  /// The chip fieldset's accessible name, phrased for `source`. Carried on the
  /// model rather than derived in the component so no user-visible string is
  /// phrased outside `COPY`.
  fieldLabel: string;
  /// Absent only when the asset has no ladder, which is also when `options` is
  /// empty — so a falsy notice means the whole control has nothing to render.
  notice: LadderNotice | undefined;
}

export interface LadderInputs {
  /// The asset's shared denominations, ascending. Empty for an asset the SDK
  /// table does not cover, and while the read is in flight — the two are not
  /// distinguished, so the fallback stands in during the read and is replaced
  /// in place if a shared ladder arrives.
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
  // Always shared: the SDK derives the ladder from the asset itself, so every
  // wallet holding it publishes the same rungs. See `LadderSource`.
  const source: LadderSource = "shared";
  const copy = COPY[source];
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
      text: formatAmountForAsset(value, meta.decimals, meta.scale),
      state: stateOf(value, entered, suggestion),
    })),
    source,
    heading: copy.heading,
    fieldLabel: copy.fieldLabel,
    notice: ladderNotice({
      ladder,
      copy,
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
/// Bounded by `spendableMax`, the same figure the "max" button writes and the
/// coin selector honours: a chip above it writes an amount the app's own
/// selector then refuses, under a label promising privacy. While that ceiling is
/// unknown the whole ladder is offered rather than none of it, matching how the
/// rest of the form treats an unresolved max.
///
/// Denominations past the `uint48` publicOut cap are dropped regardless —
/// `validateAmount` rejects them, so offering one is offering a dead button.
function offerableDenominations(ladder: Ladder, max: bigint | undefined): bigint[] {
  return ladder.filter((d) => !exceedsPublicInLimit(d) && (max === undefined || d <= max));
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
  copy: LadderCopy;
  meta: AssetMeta;
  entered: bigint | undefined;
  onLadder: boolean;
  suggestion: bigint | undefined;
  offered: number;
}

/// What to say under the chips.
///
/// Always something once the asset has a ladder, including before anything is
/// entered. Two reasons: the control is otherwise unexplained — a row of
/// amounts with no stated benefit is a row of amounts — and a line that appears
/// on the first keystroke grows the form, moving the submit button under the
/// pointer. Same constraint `FeeSummary` is built around.
function ladderNotice({
  ladder,
  copy,
  meta,
  entered,
  onLadder,
  suggestion,
  offered,
}: NoticeInputs): LadderNotice | undefined {
  // Nothing to be on or off: not even the fallback could build a ladder, which
  // means the asset has no exact circuit-unit basis to build one from. See
  // `unitsPerToken`.
  if (ladder.length === 0) return undefined;

  if (entered === undefined) {
    return {
      tone: "ok",
      tag: undefined,
      text: offered > 0 ? copy.intro : `This balance is below the smallest ${copy.noun}.`,
    };
  }

  if (onLadder) {
    return { tone: "ok", tag: copy.okTag, text: copy.onLadder(label(entered, meta)) };
  }

  const lead = `${label(entered, meta)} is published on chain as entered, which links this withdrawal to whatever funded it.`;
  return {
    tone: "warn",
    tag: "stands out",
    text:
      suggestion === undefined
        ? `${lead} No ${copy.noun} fits what this balance can cover.`
        : `${lead} Withdraw ${label(suggestion, meta)} instead.`,
  };
}

function label(value: bigint, meta: AssetMeta): string {
  return formatAssetAmount(value, meta);
}
