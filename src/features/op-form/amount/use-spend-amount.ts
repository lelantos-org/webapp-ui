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

import type { SpendableMax } from "@lelantos-org/sdk";
import { useMemo, useState } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { useAssetBalance, useBalances } from "@/features/assets";
import {
  type FeePanel,
  feeIncoming,
  feeLegFor,
  shownFee,
  useFeePanel,
  useFeePreview,
  withSymbol,
} from "@/features/fees";
import { useSpendableMax, useWalletState } from "@/features/wallet";
import type { FeeKind } from "@/shared/domain/op-kind";
import { joinHint } from "@/shared/lib/format/text";
import type { AmountReadiness, FeeReadiness, WalletReadiness } from "../submit/submit-block";
import {
  type AmountValidation,
  NO_META,
  parseAmountSafe,
  validateAmount,
} from "./amount-validation";
import { settlingHint, withheldHint } from "./balance-hint";
import { useFollowMax } from "./use-follow-max";

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
  /// A native-coin withdrawal, which the relayer prices on its own estimate. The
  /// max is read for it; the fee asset stays the user's to choose.
  native?: boolean;
}

export interface SpendAmount {
  /// The shielded balance of the asset, in circuit units.
  balance: bigint | undefined;
  /// The typed amount in circuit units; `undefined` while partial.
  parsed: bigint | undefined;
  validation: AmountValidation;
  /// The fee asset as it applies to this spend: the user's choice, or
  /// `undefined` for the asset being spent (the SDK's default).
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
  native = false,
}: SpendAmountInputs): SpendAmount {
  const row = useAssetBalance(selected?.id);
  const { isLoading: balancesLoading } = useBalances();
  const { error: syncError } = useWalletState();
  const balance = row?.balance;

  const parsed = parseAmountSafe(amountText, selected);
  const validation = validateAmount(parsed, selected, balance);
  const display = useMemo(() => withSymbol(selected, spendSymbol), [selected, spendSymbol]);

  // The displayed figure, which may be held over from the previous amount while
  // the next is priced. It does not gate the submit: a withdraw's protocol fee
  // comes off `publicOut` rather than the cover.
  const preview = useFeePreview(protocolFee ? selected?.id : undefined, parsed, feeLegFor(kind));

  // Left unset until the user picks. `undefined` means the asset being sent,
  // which is the SDK's default and stays correct across asset changes.
  const [feeAsset, setFeeAsset] = useState<bigint | undefined>(undefined);
  const fees = useFeePanel({
    kind,
    selected,
    amount: parsed,
    protocol: protocolFee ? shownFee(preview) : undefined,
    protocolPending: protocolFee && feeIncoming(preview),
    feeAsset,
    onFeeAsset: setFeeAsset,
    spendSymbol,
  });

  // Not the balance: the selector refuses reserved, cooling-down and dust notes,
  // and a spend can consume only `nIn` of what remains, so a max wired to the
  // balance would write an amount the selector rejects. See `useSpendableMax`,
  // which reserves the relayer fee by the spend's own rules.
  const spendable = useSpendableMax(selected?.id, {
    kind,
    feeAsset,
    native,
    quotedFee: fees.relayerAmount,
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
