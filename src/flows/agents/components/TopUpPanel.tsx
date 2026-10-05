import { useState } from "react";
import type { RegisteredAsset } from "@/config/chains";
import type { StoredAgent } from "@/features/agents";
import { findAsset } from "@/features/assets";
import { FeeLineSummary } from "@/features/fees";
import { parseAmountSafe, useSpendAmount } from "@/features/op-form";
import { userMessage } from "@/shared/lib/errors";
import { formatAmountForInput, formatAssetAmount } from "@/shared/lib/format/asset";
import { Masked } from "@/shared/ui/Masked";
import { topUpSubmitBlock } from "../agent-block";
import { useTopUpAgent } from "../use-top-up-agent";
import "../agents.css";

/// Inline form that sends more funds to an existing agent.
export function TopUpPanel({
  agent,
  assets,
}: {
  agent: StoredAgent;
  assets: readonly RegisteredAsset[];
}) {
  const { mutation } = useTopUpAgent();
  const [amount, setAmount] = useState("");
  const [assetId, setAssetId] = useState(() => assets[0]?.id.toString() ?? "");

  const token = findAsset(assets, assetId);
  const spend = useSpendAmount({
    kind: "transfer",
    selected: token,
    amountText: amount,
    setAmount,
  });
  const typed = amount.trim() !== "";
  const block = topUpSubmitBlock({
    ...spend.readiness,
    hasAsset: !!token,
    typed,
    validation: spend.validation,
  });
  const max = spend.spendable?.max;

  const submit = async () => {
    const parsed = token ? parseAmountSafe(amount, token) : undefined;
    if (!token || parsed === undefined || block.disabled) return;
    try {
      await mutation.mutateAsync({
        address: agent.address,
        amount: parsed,
        asset: token.id,
        ...spend.relayerFee,
      });
      setAmount("");
    } catch {
      // Shown below, from the mutation's error.
    }
  };

  // The row is small, so one line at a time: why Send is held, else how the last one failed.
  const failure = mutation.error && !mutation.isPending ? userMessage(mutation.error) : undefined;
  const problem = block.reason ?? failure;

  return (
    <div className="agent-topup">
      <label className="agent-topup__field">
        <span className="agent-field__lbl">Top up</span>
        <input
          className="text-input"
          inputMode="decimal"
          enterKeyHint="send"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>

      <select
        className="text-input agent-topup__asset"
        aria-label="Asset to send"
        value={assetId}
        onChange={(e) => setAssetId(e.target.value)}
      >
        {assets.map((a) => (
          <option key={a.id.toString()} value={a.id.toString()}>
            {a.symbol}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="btn btn--cta btn--sm"
        onClick={() => void submit()}
        disabled={mutation.isPending || block.disabled}
      >
        {mutation.isPending ? "Sending…" : "Send"}
      </button>

      {token && spend.balance !== undefined ? (
        <p className="agent-row__note agent-topup__have">
          Shielded <Masked>{formatAssetAmount(spend.balance, token)}</Masked>
          {max !== undefined && max > 0n ? (
            <button
              type="button"
              className="link-btn agent-topup__max"
              onClick={() => spend.onSetMax(formatAmountForInput(max, token))}
            >
              Max
            </button>
          ) : null}
          {typed && spend.fees.model ? (
            <span className="agent-topup__fee">
              <FeeLineSummary model={spend.fees.model} />
            </span>
          ) : null}
        </p>
      ) : null}

      {problem ? (
        <p className="agent-row__note agent-row__note--err" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
