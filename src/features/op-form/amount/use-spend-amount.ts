import type { SpendableMax } from "@lelantos-org/sdk";
import { useMemo, useState } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { useAssetBalance, useBalances } from "@/features/assets";
import {
  type FeePanel,
  feeIncoming,
  feeLegFor,
  relayerFeeCap,
  useFeePanel,
  useFeePreview,
  withSymbol,
} from "@/features/fees";
import { useSpendableMax, useWalletState } from "@/features/wallet";
import type { FeeKind } from "@/shared/domain/op-kind";
import type { RelayerFeeTerms } from "@/shared/domain/relayer-fee";
import { usePrivacy } from "@/shared/hooks/use-privacy";
import { joinHint } from "@/shared/lib/format/text";
import {
  type AmountReadiness,
  amountTextReason,
  type FeeReadiness,
  type WalletReadiness,
} from "../submit/submit-block";
import {
  type AmountValidation,
  NO_META,
  parseAmountSafe,
  validateAmount,
} from "./amount-validation";
import { heldReason, MERGE_HINT, settlingHint, spendReach, withheldHint } from "./balance-hint";
import { useFollowMax } from "./use-follow-max";

export interface SpendAmountInputs {
  kind: Exclude<FeeKind, "deposit">;
  selected: RegisteredAsset | undefined;
  amountText: string;
  setAmount(formatted: string): void;
  /// Shows the protocol fee; only a withdraw has a transparent leg to charge.
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
  /// What the spend passes on: the fee asset, and the fee on screen as its cap.
  relayerFee: RelayerFeeTerms;
  fees: FeePanel;
  spendable: SpendableMax | undefined;
  onSetMax(formatted: string): void;
  /// What is still settling or held back, and whether the amount needs the funds merged first.
  hint: string | undefined;
  /// The amount needs the funds merged before it can be sent: an extra proof and relayer fee.
  needsMerge: boolean;
  /// `selected`, relabelled by `spendSymbol`.
  display: RegisteredAsset | undefined;
  readiness: WalletReadiness & AmountReadiness & FeeReadiness;
}

/// A shielded spend's amount, balance, fees and max, derived in one place so they agree.
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
  const { hidden } = usePrivacy();

  const parsed = parseAmountSafe(amountText, selected);
  const validation = validateAmount(parsed, selected, balance);
  const display = useMemo(() => withSymbol(selected, spendSymbol), [selected, spendSymbol]);

  const preview = useFeePreview(protocolFee ? selected?.id : undefined, parsed, feeLegFor(kind));

  const [feeAsset, setFeeAsset] = useState<bigint | undefined>(undefined);
  const fees = useFeePanel({
    kind,
    selected,
    amount: parsed,
    protocol: protocolFee ? preview.data : undefined,
    protocolPending: protocolFee && feeIncoming(preview),
    feeAsset,
    onFeeAsset: setFeeAsset,
    spendSymbol,
    native,
  });

  // Max comes from the spendable max, not the balance: the note selector rejects a max taken from the balance.
  const spendable = useSpendableMax(selected?.id, {
    kind,
    feeAsset,
    native,
    quotedFee: fees.relayerAmount,
  });

  const { onSetMax } = useFollowMax(spendable?.max, selected, amountText, setAmount);

  const meta = display ?? NO_META;
  // Judged only for an amount the balance covers: the field reports the rest itself.
  const reach = validation.valid ? spendReach(parsed, spendable) : "direct";
  const hint = joinHint(
    settlingHint(balance, row?.pending ?? 0n, row?.outflow ?? 0n, meta, hidden),
    withheldHint(spendable, meta, hidden),
    reach === "merge" ? MERGE_HINT : undefined,
  );
  const held = reach === "held" && spendable ? heldReason(spendable, meta) : undefined;

  return {
    balance,
    parsed,
    validation,
    feeAsset,
    relayerFee: { feeAsset, maxFee: relayerFeeCap(fees) },
    fees,
    spendable,
    onSetMax,
    hint,
    needsMerge: reach === "merge",
    display,
    readiness: {
      syncErrored: !!syncError,
      balancesLoading,
      // An amount held back by something still settling would fail after the review.
      amountValid: validation.valid && held === undefined,
      amountReason:
        validation.tooLarge || validation.insufficient
          ? undefined
          : (held ?? amountTextReason(amountText, parsed, display?.symbol)),
      feeBlock: fees.block,
      feePending: fees.pending,
    },
  };
}
