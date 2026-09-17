import type { EvmAddress } from "@lelantos-org/sdk";
import { useId, useState } from "react";
import { isZeroAddress, useDelegate, useGovernance, useVotingPower } from "@/features/governance";
import { useWallet } from "@/features/wallet";
import { formatVotes } from "../governance-copy";
import { useGovTx } from "../use-gov-tx";
import { DelegatePanel, delegateLabel } from "./DelegatePanel";

/// The header card: this account's transparent LNT, its voting power now and
/// who it delegates to, with delegation one click away.
export function VotingPowerCard() {
  const titleId = useId();
  const { account } = useGovernance();
  const { capabilities } = useWallet();
  const power = useVotingPower();
  const delegate = useDelegate();
  const { tx, onSent, begin } = useGovTx(delegate);
  const [open, setOpen] = useState(false);
  const p = power.data;

  const notDelegated = p !== undefined && isZeroAddress(p.delegate) && p.balance > 0n;

  const run = (delegatee: EvmAddress) => {
    if (!p) return;
    begin();
    delegate.mutate({ token: p.token, delegatee, onSent });
  };

  return (
    <section className="surface surface--card gov-card gov-power" aria-labelledby={titleId}>
      <div className="gov-card__hdr">
        <h2 className="gov-card__t" id={titleId}>
          Your voting power
        </h2>
        {account ? (
          <button
            type="button"
            className="link-btn gov-power__toggle"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Hide delegation" : "Manage delegation"}
          </button>
        ) : null}
      </div>
      {!account ? (
        <p className="muted gov-power__none">
          {capabilities.govern.reason ??
            "Connect a browser wallet to see your LNT and voting power."}
        </p>
      ) : power.isError ? (
        <p className="muted">Could not read your voting power from the chain.</p>
      ) : (
        <dl className="gov-stats">
          <div className="gov-stats__item">
            <dt>Transparent {p?.symbol ?? "LNT"}</dt>
            <dd className="figure">{p ? formatVotes(p.balance, p.decimals) : "…"}</dd>
          </div>
          <div className="gov-stats__item">
            <dt>Votes now</dt>
            <dd className="figure">{p ? formatVotes(p.votes, p.decimals) : "…"}</dd>
          </div>
          <div className="gov-stats__item">
            <dt>Delegate</dt>
            <dd className="mono gov-stats__addr">{delegateLabel(p?.delegate, account)}</dd>
          </div>
        </dl>
      )}
      {notDelegated && !open ? (
        <p className="gov-power__hint warn">
          Your LNT has no votes until you delegate it — to yourself is fine.
        </p>
      ) : null}
      {open && account ? (
        <DelegatePanel
          account={account}
          currentDelegate={p?.delegate}
          canSign={capabilities.govern.allowed}
          signerReason={capabilities.govern.reason}
          onDelegate={run}
          tx={tx}
        />
      ) : null}
    </section>
  );
}
