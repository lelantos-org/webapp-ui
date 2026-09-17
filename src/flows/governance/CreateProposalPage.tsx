import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  canPropose,
  knownContracts,
  useGovernance,
  usePropose,
  useVotingPower,
} from "@/features/governance";
import { useWallet } from "@/features/wallet";
import { Notice } from "@/shared/ui/Notice";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { CreateProposalForm } from "./components/CreateProposalForm";
import { GovernorGate } from "./components/GovernorGate";
import { GovTxStatus } from "./components/GovTxStatus";
import { formatVotes } from "./governance-copy";
import { useGovTx } from "./use-gov-tx";
import "./governance.css";

/// `/governance/new`.
export function CreateProposalPage() {
  return (
    <GovernorGate>
      <CreateProposal />
    </GovernorGate>
  );
}

function CreateProposal() {
  const { chain } = useGovernance();
  const { capabilities } = useWallet();
  const power = useVotingPower();
  const propose = usePropose();
  const navigate = useNavigate();
  const { tx, onSent, begin } = useGovTx(propose);
  const contracts = useMemo(() => knownContracts(chain), [chain]);
  const p = power.data;

  const blocked = !capabilities.govern.allowed
    ? capabilities.govern.reason
    : p === undefined
      ? "Reading your voting power…"
      : !canPropose(p.proposeVotes, p.threshold)
        ? `Proposing needs ${formatVotes(p.threshold, p.decimals)} ${p.symbol} of voting power; you have ${formatVotes(p.proposeVotes, p.decimals)}.`
        : undefined;

  return (
    <>
      <ScreenHeader
        title="New proposal"
        subtitle="Anyone with enough voting power can propose. If it passes, the timelock executes its actions."
        backTo="/governance"
        backLabel="Back to proposals"
      />
      {p && !canPropose(p.proposeVotes, p.threshold) && capabilities.govern.allowed ? (
        <Notice tone="warn" title="Below the proposal threshold">
          The governor accepts a proposal only from an account whose voting power, one second before
          it is submitted, is at least {formatVotes(p.threshold, p.decimals)} {p.symbol}. Voting
          power is delegated LNT: delegate to yourself first if you have not.
        </Notice>
      ) : null}
      {propose.status !== "idle" && propose.status !== "success" ? (
        <GovTxStatus
          status={tx.status}
          error={tx.error}
          hash={tx.hash}
          pendingTitle="Submitting your proposal"
          doneTitle="Proposal created"
          failedTitle="Your proposal was not created"
          onRetry={tx.reset}
        />
      ) : null}
      {propose.status === "idle" || propose.status === "error" ? (
        <CreateProposalForm
          contracts={contracts}
          blocked={blocked}
          onSubmit={(actions, description) => {
            begin();
            propose.mutate(
              { actions, description, onSent },
              {
                onSuccess: ({ proposalId }) =>
                  navigate(proposalId ? `/governance/${proposalId}` : "/governance"),
              },
            );
          }}
        />
      ) : null}
    </>
  );
}
