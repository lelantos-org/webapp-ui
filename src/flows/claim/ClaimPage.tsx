import type { WalletStatus } from "@/features/wallet";
import { useWallet } from "@/features/wallet";
import { BalancesCard } from "./components/BalancesCard";
import { ClaimHero } from "./components/ClaimHero";
import { ClaimStepper } from "./components/ClaimStepper";
import { ConnectGate } from "./components/ConnectGate";
import { NetworkGateCard } from "./components/NetworkGateCard";
import {
  BadLinkCard,
  ClaimErrorCard,
  DoneCard,
  ReadingFragmentCard,
  ScanningCard,
} from "./components/StatusCards";
import { SweepingCard } from "./components/SweepingCard";
import { heroSubtitleFor, stepperStateFor } from "./phase-presenter";
import { type ClaimFlow, useClaimFlow } from "./use-claim-flow";
import "./ClaimPage.css";

export function ClaimPage() {
  const { wallet, status, connect } = useWallet();
  const flow = useClaimFlow();
  const { phase, mismatch, connected } = flow;
  // The stepper holds at "Connect" until there is a wallet on the link's network to claim into.
  const blocked = mismatch !== undefined || !connected;

  return (
    <div className="claim-page">
      <ClaimHero subtitle={heroSubtitleFor(phase, blocked)} />

      <ClaimStepper state={stepperStateFor(phase, blocked)} />

      {mismatch ? <NetworkGateCard mismatch={mismatch} /> : null}

      <PhaseCard
        flow={flow}
        status={status}
        onConnect={connect}
        destinationAddress={wallet?.address}
      />

      <p className="footnote claim-page__foot">
        The claim code is stripped from the address bar the moment this page opens.
      </p>
    </div>
  );
}

interface PhaseCardProps {
  flow: ClaimFlow;
  status: WalletStatus;
  onConnect(): void;
  destinationAddress?: string | undefined;
}

function PhaseCard({ flow, status, onConnect, destinationAddress }: PhaseCardProps) {
  const { phase, mismatch, connected } = flow;
  const assets = flow.linkChain?.tokens ?? [];
  switch (phase.kind) {
    case "reading-fragment":
      return <ReadingFragmentCard />;

    case "bad-link":
      return <BadLinkCard error={phase.error} reason={phase.reason} />;

    case "need-wallet":
    case "loading":
      return <ScanningCard />;

    case "ready":
      return (
        <>
          <BalancesCard
            balances={phase.balances}
            assets={assets}
            linkChainId={phase.chainId}
            destinationAddress={destinationAddress}
            claimDisabled={mismatch !== undefined}
            onClaim={connected ? flow.claim : undefined}
            onRescan={flow.rescan}
          />
          {/* Asked for only once there is something to claim, and not over the network gate. */}
          {!connected && !mismatch && phase.balances.length > 0 ? (
            <ConnectGate status={status} onConnect={onConnect} />
          ) : null}
        </>
      );

    case "sweeping":
      return <SweepingCard phase={phase} assets={assets} progress={flow.progress} />;

    case "done":
      return (
        <DoneCard
          txHash={phase.txHash}
          asset={phase.asset}
          amount={phase.amount}
          assets={assets}
          destinationAddress={destinationAddress}
          onClaimRest={phase.rest ? flow.claimRest : undefined}
        />
      );

    case "error":
      return <ClaimErrorCard message={phase.message} from={phase.from} onRetry={flow.retry} />;
  }
}
