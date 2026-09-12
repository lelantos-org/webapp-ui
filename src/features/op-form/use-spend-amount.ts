// The amount concern every shielded spend shares: what the user typed, what the
// shielded balance can cover, what the relayer charges and in which asset, and
// what "max" writes.
//
// Send, Unshield, Swap and Send by link each assembled this from the same seven
// reads in the same order, and the pieces depend on each other — the fee asset
// moves the ceiling, the relayer's charge comes out of it, the max follows it —
// so a form that re-derived one of them differently drew a max the selector
// refused. Shield's counterpart is `flows/shield/use-deposit-amount.ts`: a
// deposit draws on the public wallet and pays its fees on top, which is a
// different set of reads.

import type { SpendableMax } from "@lelantos-org/sdk/wallet";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { useAssetBalance, useBalances } from "@/features/assets";
import {
  type FeePanel,
  feeIncoming,
  feeLegFor,
  shownFee,
  useFeePanel,
  useFeePreview,
} from "@/features/fees";
import { useSpendableMax, useWalletState } from "@/features/wallet";
import type { FeeKind } from "@/shared/domain/op-kind";
import { formatAmountForAsset } from "@/shared/lib/format/asset";
import { joinHint } from "@/shared/lib/text";
import {
  type AmountValidation,
  type AssetMeta,
  NO_META,
  parseAmountSafe,
  validateAmount,
} from "./amount-validation";
import { settlingHint, withheldHint } from "./balance-hint";
import type { AmountReadiness, FeeReadiness, WalletReadiness } from "./submit-block";

export interface SpendAmountInputs {
  kind: Exclude<FeeKind, "deposit">;
  /// The asset being spent.
  selected: RegisteredAsset | undefined;
  /// The amount field's raw text.
  amountText: string;
  /// The form's own writer, for the max button.
  setAmount(formatted: string): void;
  /// State the spend's protocol fee in the panel. Only a withdraw has a
  /// transparent leg for `MASP._takeFee` to charge; a transfer or swap passes
  /// nothing, and no preview is read for it.
  protocolFee?: boolean;
  /// The name the screen gives the asset, where it is not the registry's: a
  /// native-ETH unshield spends WETH notes under "ETH". See
  /// `FeePanelInputs.spendSymbol`.
  spendSymbol?: string | undefined;
  /// The fee asset is not the user's to choose on this path. `withdrawEth` takes
  /// no `feeAsset`, so a choice made before switching to native ETH is ignored
  /// everywhere — the panel, the max, the send — and the picker is withheld.
  /// The stored choice is kept, and switching back restores it.
  feeAssetLocked?: boolean;
}

export interface SpendAmount {
  /// The shielded balance of the asset, in circuit units.
  balance: bigint | undefined;
  /// The typed amount in circuit units; `undefined` while partial.
  parsed: bigint | undefined;
  validation: AmountValidation;
  /// The fee asset as it applies to this spend: the user's choice, or
  /// `undefined` for the asset being spent (the SDK's default) or a locked path.
  feeAsset: bigint | undefined;
  fees: FeePanel;
  /// What a single spend can cover; see `useSpendableMax`.
  spendable: SpendableMax | undefined;
  /// Pass to `AmountHero.onSetMax`; see `useFollowMax`.
  onSetMax(formatted: string): void;
  /// The quiet line under the balance: what is still settling or held back.
  hint: string | undefined;
  /// The asset as the screen names it: `selected`, relabelled by `spendSymbol`.
  display: RegisteredAsset | undefined;
  /// Everything the shared submit-block questions read, ready to spread.
  readiness: WalletReadiness & AmountReadiness & FeeReadiness;
}

export function useSpendAmount({
  kind,
  selected,
  amountText,
  setAmount,
  protocolFee = false,
  spendSymbol,
  feeAssetLocked = false,
}: SpendAmountInputs): SpendAmount {
  const row = useAssetBalance(selected?.id);
  const { isLoading: balancesLoading } = useBalances();
  const { error: syncError } = useWalletState();
  const balance = row?.balance;

  const parsed = parseAmountSafe(amountText, selected);
  const validation = validateAmount(parsed, selected, balance);
  const display = useMemo(
    () => (selected && spendSymbol !== undefined ? { ...selected, symbol: spendSymbol } : selected),
    [selected, spendSymbol],
  );

  // The displayed figure, which may be held over from the previous amount while
  // the next is priced. It does not gate the submit: a withdraw's protocol fee
  // comes off `publicOut` rather than the cover.
  const preview = useFeePreview(protocolFee ? selected?.id : undefined, parsed, feeLegFor(kind));

  // Left unset until the user picks. `undefined` means the asset being sent,
  // which is the SDK's default and stays correct across asset changes.
  const [chosenFeeAsset, setFeeAsset] = useState<bigint | undefined>(undefined);
  const feeAsset = feeAssetLocked ? undefined : chosenFeeAsset;
  const fees = useFeePanel({
    kind,
    selected,
    amount: parsed,
    protocol: protocolFee ? shownFee(preview) : undefined,
    protocolPending: protocolFee && feeIncoming(preview),
    feeAsset,
    onFeeAsset: feeAssetLocked ? undefined : setFeeAsset,
    spendSymbol,
  });

  // Not the balance: the selector refuses reserved, cooling-down and dust notes,
  // and a spend can consume only `nIn` of what remains, so a max wired to the
  // balance would write an amount the selector rejects. See `useSpendableMax`.
  // A same-asset relayer fee comes out of this spend's own target, so the most
  // that can be sent is the ceiling less the fee; a cross-asset one reserves an
  // input slot instead.
  const crossAssetFee = feeAsset !== undefined && feeAsset !== selected?.id;
  const spendable = useSpendableMax(selected?.id, {
    crossAssetFee,
    sameAssetFee: crossAssetFee ? 0n : fees.relayerAmount,
  });

  // Switching the fee asset moves the ceiling, so a figure written before that
  // change must move with it. See `useFollowMax`.
  const { onSetMax } = useFollowMax(spendable?.max, selected, amountText, setAmount);

  const meta = display ?? NO_META;
  const hint = joinHint(
    settlingHint(balance, row?.pending ?? 0n, row?.outflow ?? 0n, meta),
    withheldHint(spendable, meta),
  );

  return {
    balance,
    parsed,
    validation,
    feeAsset,
    fees,
    spendable,
    onSetMax,
    hint,
    display,
    readiness: {
      syncErrored: !!syncError,
      balancesLoading,
      amountValid: validation.valid,
      amountEntered: amountText.trim() !== "",
      feeBlock: fees.block,
      feePending: fees.pending,
    },
  };
}

interface FollowMax {
  /// Pass to `AmountHero`'s `onSetMax` in place of `setAmount`.
  onSetMax(formatted: string): void;
}

/// Keep a maxed-out amount field in step with a max that moves under it.
///
/// The ceiling is not a constant. Switching the relayer's fee asset to one the
/// spend is not already moving costs an input slot — `prepareSpend` passes
/// `nIn - 1` — so the most that can be sent drops the moment the picker
/// changes. A figure written before that change is one the selector will refuse,
/// reported as `insufficient cover` against a number the app itself wrote.
///
/// Only the value this hook wrote is rewritten. An amount the user typed is left
/// alone even when it becomes too large; validation marks it instead.
export function useFollowMax(
  max: bigint | undefined,
  selected: AssetMeta | undefined,
  /// The field's current text, distinguishing an unchanged written value from an
  /// edited one.
  current: string,
  setAmount: (formatted: string) => void,
): FollowMax {
  // What the max button last wrote. A ref rather than state: it records a past
  // render's output, and mirroring it into state would re-render on its own.
  const written = useRef<string | undefined>(undefined);

  const onSetMax = (formatted: string) => {
    written.current = formatted;
    setAmount(formatted);
  };

  useEffect(() => {
    if (max === undefined || !selected) return;
    // Nothing was written, or the field has since been edited; either way there
    // is nothing to correct.
    if (written.current === undefined || current !== written.current) return;

    const next = formatAmountForAsset(max, selected);
    if (next === written.current) return;
    written.current = next;
    setAmount(next);
  }, [max, selected, current, setAmount]);

  return { onSetMax };
}
