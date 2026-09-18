import { Link } from "react-router-dom";
import { useAgentAssetsFor, useAgentChainFor, useAgents } from "@/features/agents";
import { useActiveChain } from "@/features/chain";
import { Notice } from "@/shared/ui/Notice";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { AgentRow } from "./components/AgentRow";
import "./agents.css";

/// The agents this browser has funded, and their keys.
export function AgentsPage() {
  const { stored, memoryOnly, full } = useAgents();
  const assetsFor = useAgentAssetsFor();
  const chainFor = useAgentChainFor();
  const active = useActiveChain();
  const now = Date.now();

  return (
    <>
      <ScreenHeader
        title="Agents"
        subtitle="Shielded wallets you fund and hand to a process. The agent spends from its own balance; you can sweep it back at any time."
        backTo="/"
        backLabel="Back"
      />

      {memoryOnly ? (
        <Notice tone="err" title="Storage refused the last write">
          These keys are held in memory only and will not survive this tab. Copy any credential you
          still need before closing it.
        </Notice>
      ) : null}

      {full ? (
        <Notice tone="warn" title="Agent list is full">
          Funding another would push the oldest record, and its key, out of storage. Sweep and
          forget one first.
        </Notice>
      ) : null}

      {stored.length === 0 ? (
        <div className="surface surface--card agents__empty">
          <p>
            No agents yet. Funding one mints a fresh shielded wallet, sends it an amount you choose,
            and gives you a credential to hand over.
          </p>
          <Link className="btn btn--cta" to="/agents/new">
            Fund an agent
          </Link>
        </div>
      ) : (
        <>
          <ul className="agents__list">
            {stored.map((agent) => {
              const chain = chainFor(agent);
              return (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  assets={assetsFor(agent)}
                  chainName={
                    chain && chain.chainId !== active.chainId ? chain.chainName : undefined
                  }
                  now={now}
                />
              );
            })}
          </ul>
          <Link className="btn btn--cta agents__new" to="/agents/new">
            Fund another agent
          </Link>
        </>
      )}
    </>
  );
}
