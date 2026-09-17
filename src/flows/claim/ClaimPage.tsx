import type { RegisteredAsset } from "@/config/chains";
import type { WalletStatus } from "@/features/wallet";
import { useWallet } from "@/features/wallet";
import type { ChainMismatch } from "./chain-guard";
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
import type { Phase } from "./phase-machine";
import { heroSubtitleFor, linkChainIdOf, stepperStateFor } from "./phase-presenter";
import { useClaimFlow } from "./use-claim-flow";
import "./ClaimPage.css";

export function ClaimPage() {
  const { wallet, status, connect } = useWallet();
  const { phase, linkChain, mismatch, claim, retry } = useClaimFlow();
  const blocked = mismatch !== undefined;

  return (
    <div className="claim-page">
      <ClaimHero subtitle={heroSubtitleFor(phase, blocked)} />

      <ClaimStepper state={stepperStateFor(phase, blocked)} />

      {mismatch ? <NetworkGateCard mismatch={mismatch} /> : null}

      <PhaseCard
        phase={phase}
        mismatch={mismatch}
        status={status}
        onConnect={connect}
        assets={linkChain?.tokens ?? []}
        destinationAddress={wallet?.address}
        onClaim={claim}
        onRetry={retry}
      />

      <p className="footnote claim-page__foot">
        The claim code is stripped from the address bar the moment this page opens.
      </p>
    </div>
  );
}

interface PhaseCardProps {
  phase: Phase;
  mismatch: ChainMismatch | undefined;
  status: WalletStatus;
  assets: readonly RegisteredAsset[];
  destinationAddress?: string | undefined;
  onConnect(): void;
  onClaim(asset: bigint): void;
  onRetry(): void;
}

function PhaseCard({
  phase,
  mismatch,
  status,
  assets,
  destinationAddress,
  onConnect,
  onClaim,
  onRetry,
}: PhaseCardProps) {
  switch (phase.kind) {
    case "reading-fragment":
      return <ReadingFragmentCard />;

    case "bad-link":
      return <BadLinkCard error={phase.error} reason={phase.reason} />;

    case "need-wallet":
      return mismatch ? null : <ConnectGate status={status} onConnect={onConnect} />;

    case "loading":
      return mismatch ? null : <ScanningCard />;

    case "ready":
    case "sweeping":
      return (
        <BalancesCard
          balances={phase.balances}
          assets={assets}
          linkChainId={linkChainIdOf(phase)}
          destinationAddress={destinationAddress}
          busy={phase.kind === "sweeping"}
          busyAsset={phase.kind === "sweeping" ? phase.asset : undefined}
          claimDisabled={mismatch !== undefined}
          onClaim={onClaim}
        />
      );

    case "done":
      return (
        <DoneCard
          txHash={phase.txHash}
          asset={phase.asset}
          amount={phase.amount}
          assets={assets}
          destinationAddress={destinationAddress}
        />
      );

    case "error":
      return <ClaimErrorCard message={phase.message} from={phase.from} onRetry={onRetry} />;
  }
}
