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
  selected: RegisteredAsset | undefined;
  amountText: string;
  setAmount(formatted: string): void;
  /// Show the protocol fee; only a withdraw has a transparent leg to charge.
  protocolFee?: boolean;
  /// The screen's name for the asset where it differs from the registry's ("ETH" for WETH).
  spendSymbol?: string | undefined;
  /// A native-coin withdrawal.
  native?: boolean;
}

export interface SpendAmount {
  /// Circuit units.
  balance: bigint | undefined;
  /// Circuit units; `undefined` while partial.
  parsed: bigint | undefined;
  validation: AmountValidation;
  /// The chosen fee asset, or `undefined` for the asset being spent.
  feeAsset: bigint | undefined;
  fees: FeePanel;
  spendable: SpendableMax | undefined;
  onSetMax(formatted: string): void;
  /// What is still settling or held back.
  hint: string | undefined;
  /// `selected`, relabelled by `spendSymbol`.
  display: RegisteredAsset | undefined;
  readiness: WalletReadiness & AmountReadiness & FeeReadiness;
}

/// A shielded spend's amount, balance, fees and max, derived together so they agree.
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

  const preview = useFeePreview(protocolFee ? selected?.id : undefined, parsed, feeLegFor(kind));

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

  // Not the balance: a max from the balance would write an amount the note selector rejects.
  const spendable = useSpendableMax(selected?.id, {
    kind,
    feeAsset,
    native,
    quotedFee: fees.relayerAmount,
  });

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
