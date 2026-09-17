import { useMemo } from "react";
import { useActiveChain } from "@/features/chain";
import { decodeAction, knownContracts, type ProposalDetail } from "@/features/governance";
import { formatDecimal } from "@/shared/lib/format/number";

/// What the proposal executes if it passes, decoded where a known ABI matches
/// and shown as raw calldata where none does.
export function ActionsList({ actions }: { actions: ProposalDetail["actions"] }) {
  const chain = useActiveChain();
  const contracts = useMemo(() => knownContracts(chain), [chain]);
  if (actions.length === 0) return <p className="muted">This proposal executes nothing.</p>;
  return (
    <ol className="gov-actions">
      {actions.map((a, i) => {
        const d = decodeAction(a, contracts);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: actions are positional and never reorder.
          <li key={i} className="gov-action">
            <div className="gov-action__hdr">
              <span className="gov-action__n">{i + 1}</span>
              <span className="gov-action__fn mono">
                {d.kind === "call"
                  ? d.signature
                  : d.kind === "transfer"
                    ? "ETH transfer"
                    : "Unknown call"}
              </span>
              {d.kind === "call" ? (
                <span className="badge gov-badge gov-badge--neutral">{d.contract.label}</span>
              ) : null}
            </div>
            <dl className="gov-kv">
              <div>
                <dt>Target</dt>
                <dd className="mono brk">{a.target}</dd>
              </div>
              {a.value > 0n ? (
                <div>
                  <dt>Value</dt>
                  <dd className="mono">{formatDecimal(a.value, 18)} ETH</dd>
                </div>
              ) : null}
              {d.kind === "call"
                ? d.args.map((arg) => (
                    <div key={arg.name}>
                      <dt>
                        {arg.name} <span className="muted">{arg.type}</span>
                      </dt>
                      <dd className="mono brk">{arg.value}</dd>
                    </div>
                  ))
                : null}
              {d.kind === "raw" ? (
                <div>
                  <dt>Calldata</dt>
                  <dd className="mono brk gov-calldata">{a.calldata}</dd>
                </div>
              ) : null}
            </dl>
            {d.kind === "call" && d.contractMatches === false ? (
              <p className="gov-action__warn warn">
                Decoded with the {d.contract.label} ABI, but the target is not the{" "}
                {d.contract.label} this network registers.
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
