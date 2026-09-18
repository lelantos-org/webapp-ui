import { useState } from "react";
import type { RegisteredAsset } from "@/config/chains";
import type { StoredAgent } from "@/features/agents";
import { forgetAgent } from "@/features/agents";
import { formatAssetAmount } from "@/shared/lib/format/asset";
import { relativeTime } from "@/shared/lib/format/time";
import { useAgentWallet } from "../use-agent-wallet";
import { CredentialPanel } from "./CredentialPanel";
import { TopUpPanel } from "./TopUpPanel";
import "../agents.css";

export interface AgentRowProps {
  agent: StoredAgent;
  assets: readonly RegisteredAsset[];
  /// Set when the record belongs to a network other than the active one.
  chainName: string | undefined;
  now: number;
}

export function AgentRow({ agent, assets, chainName, now }: AgentRowProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const w = useAgentWallet(agent);
  const revoked = agent.revokedAt !== undefined;

  return (
    <li className="agent-row">
      <div className="agent-row__head">
        <button
          type="button"
          className="agent-row__toggle"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="agent-row__label">{agent.label}</span>
        </button>
        {revoked ? <span className="badge">swept</span> : null}
        {agent.copiedAt === undefined ? (
          <span className="badge badge--warn" title="The credential has not left this browser">
            not handed over
          </span>
        ) : null}
        {chainName ? <span className="badge">{chainName}</span> : null}
        <span className="agent-row__age">{relativeTime(agent.createdAt, now)}</span>
      </div>

      {open ? (
        <div className="agent-row__body">
          {/* What the agent holds, and how to give it more. */}
          <section className="agent-sect" aria-label="Funds">
            <h3 className="agent-sect__t">Funds</h3>
            <code className="agent-row__addr" title="Where to send top-ups">
              {agent.address}
            </code>

            <Balances state={w.state} assets={assets} onSweep={w.sweep} onSweepAll={w.sweepAll} />

            <button
              type="button"
              className="btn btn--outline btn--sm agent-sect__act"
              onClick={() => void w.inspect()}
              disabled={w.state.kind === "busy"}
            >
              {w.state.kind === "busy" && w.state.what === "inspecting"
                ? "Checking…"
                : "Check balance"}
            </button>

            {revoked ? null : <TopUpPanel agent={agent} assets={assets} />}
          </section>

          <hr className="rule" />

          {/* The key itself, and forgetting this browser's copy of it. */}
          <section className="agent-sect" aria-label="Credential">
            <h3 className="agent-sect__t">Credential</h3>
            <CredentialPanel agent={agent} />

            <div className="agent-row__actions">
              {confirming ? (
                <>
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    onClick={() => forgetAgent(agent.id)}
                  >
                    Yes, forget the key
                  </button>
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setConfirming(true)}
                >
                  Forget my copy
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </li>
  );
}

function Balances({
  state,
  assets,
  onSweep,
  onSweepAll,
}: {
  state: ReturnType<typeof useAgentWallet>["state"];
  assets: readonly RegisteredAsset[];
  onSweep(asset: bigint): Promise<void>;
  onSweepAll(assets: readonly bigint[]): Promise<void>;
}) {
  const label = (amount: bigint, asset: bigint) => {
    const token = assets.find((a) => a.id === asset);
    return token ? formatAssetAmount(amount, token) : `${amount} of asset ${asset}`;
  };

  if (state.kind === "idle") {
    return <p className="agent-row__note">Balance is read on demand — it needs a scan.</p>;
  }
  if (state.kind === "busy") {
    if (state.what === "inspecting") return <p className="agent-row__note">Scanning…</p>;
    // One proof per asset, so a multi-asset sweep is worth counting out loud.
    return (
      <p className="agent-row__note">
        Sweeping {state.done + 1} of {state.total}…
      </p>
    );
  }
  if (state.kind === "error") {
    return <p className="agent-row__note agent-row__note--err">{state.message}</p>;
  }
  if (state.kind === "swept") return <SweepReport state={state} label={label} />;

  if (state.balances.length === 0) {
    return <p className="agent-row__note">This agent holds nothing.</p>;
  }

  const held = state.balances.filter((b) => b.amount > 0n).map((b) => b.asset);

  return (
    <>
      <ul className="agent-bal">
        {state.balances.map((b) => (
          <li key={b.asset.toString()} className="agent-bal__row">
            <span>{label(b.amount, b.asset)}</span>
            <button
              type="button"
              className="btn btn--danger btn--sm"
              onClick={() => void onSweep(b.asset)}
            >
              Sweep back
            </button>
          </li>
        ))}
      </ul>
      {held.length > 1 ? (
        <button
          type="button"
          className="btn btn--danger btn--sm"
          onClick={() => void onSweepAll(held)}
        >
          Sweep everything ({held.length} transfers)
        </button>
      ) : null}
    </>
  );
}

/// What a sweep actually managed. Partial success is the interesting case: one
/// asset failing leaves the others swept and the agent still holding something.
function SweepReport({
  state,
  label,
}: {
  state: Extract<ReturnType<typeof useAgentWallet>["state"], { kind: "swept" }>;
  label(amount: bigint, asset: bigint): string;
}) {
  return (
    <div className="agent-row__note">
      <p className="agent-row__note">
        {state.txHashes.length === 0
          ? "Nothing was swept."
          : `Swept ${state.txHashes.length} transfer(s) back to your wallet.`}
      </p>
      {state.failed.length > 0 ? (
        <ul className="agent-bal">
          {state.failed.map((f) => (
            <li key={f.asset.toString()} className="agent-row__note agent-row__note--err">
              {label(0n, f.asset)} failed: {f.message}
            </li>
          ))}
        </ul>
      ) : null}
      {!state.emptied ? (
        <p className="agent-row__note agent-row__note--err">
          The agent still holds something — check the balance again.
        </p>
      ) : null}
    </div>
  );
}
