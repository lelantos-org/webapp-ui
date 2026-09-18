import { useState } from "react";
import type { RegisteredAsset } from "@/config/chains";
import type { StoredAgent } from "@/features/agents";
import { parseAmountSafe } from "@/features/op-form";
import { useTopUpAgent } from "../use-top-up-agent";
import "../agents.css";

/// Send more to an agent that already exists.
///
/// Inline rather than a screen of its own: topping up is the routine act, and a
/// route change to repeat a number the operator already knows would be friction
/// in the one place there should be none.
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
  const [problem, setProblem] = useState<string | undefined>(undefined);

  const token = assets.find((a) => a.id.toString() === assetId);

  const submit = async () => {
    setProblem(undefined);
    if (!token) return setProblem("No assets on this network");

    // `undefined` covers both an unparseable figure and one with more decimals
    // than the token has; either way there is nothing to send.
    const parsed = parseAmountSafe(amount, token);
    if (parsed === undefined) return setProblem(`That is not an amount of ${token.symbol}`);

    try {
      await mutation.mutateAsync({
        address: agent.address,
        amount: parsed,
        asset: token.id,
      });
      setAmount("");
    } catch {
      // `useTopUpAgent` already toasts; the row keeps its inline slot for parse
      // errors, which never reach the mutation.
    }
  };

  return (
    <div className="agent-topup">
      <label className="agent-topup__field">
        <span className="agent-field__lbl">Top up</span>
        <input
          className="agent-input"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>

      <select
        className="agent-input agent-topup__asset"
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
        disabled={mutation.isPending || amount.trim() === ""}
      >
        {mutation.isPending ? "Sending…" : "Send"}
      </button>

      {problem ? <span className="agent-row__note agent-row__note--err">{problem}</span> : null}
    </div>
  );
}
