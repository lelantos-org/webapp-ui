import type { RegisteredAsset } from "@/features/assets";
import type { WalletStatus } from "@/features/wallet";
import { useWallet } from "@/features/wallet";
import { Stepper } from "@/shared/ui/Stepper";
import type { ChainMismatch } from "./chain-guard";
import { BalancesCard } from "./components/BalancesCard";
import { ConnectGate } from "./components/ConnectGate";
import { NetworkGateCard } from "./components/NetworkGateCard";
import {
  BadLinkCard,
  ClaimHero,
  DoneCard,
  ErrorCard,
  ReadingFragmentCard,
  ScanningCard,
} from "./components/StatusCards";
import type { Phase } from "./phase-machine";
import { CLAIM_STEPS, heroSubtitleFor, stepperStateFor } from "./phase-presenter";
import { useClaimFlow } from "./use-claim-flow";

export function ClaimPage() {
  const { wallet, status, connect } = useWallet();
  const { phase, linkChain, mismatch, claim, retry } = useClaimFlow();
  const blocked = mismatch !== undefined;
  const { current, failed, done } = stepperStateFor(phase, blocked);

  return (
    <div className="stack claim-page">
      <ClaimHero subtitle={heroSubtitleFor(phase, blocked)} />

      <Stepper steps={CLAIM_STEPS} current={current} failed={failed} done={done} />

      {mismatch ? <NetworkGateCard mismatch={mismatch} /> : null}

      <PhaseCard
        phase={phase}
        mismatch={mismatch}
        status={status}
        onConnect={connect}
        // The link names its own chain and the notes live only there, so labels
        // come from it rather than from the wallet's current chain.
        assets={linkChain?.tokens ?? []}
        destinationAddress={wallet?.address}
        onClaim={claim}
        onRetry={retry}
      />
    </div>
  );
}

interface PhaseCardProps {
  phase: Phase;
  mismatch: ChainMismatch | undefined;
  status: WalletStatus;
  assets: readonly RegisteredAsset[];
  destinationAddress?: string;
  onConnect(): void;
  onClaim(asset: bigint): void;
  onRetry(): void;
}

/// The one card that belongs to the current phase.
///
/// A switch rather than a chain of `phase.kind === …` checks: it returns on every
/// phase, so adding one to the machine is a compile error here rather than a
/// screen that renders nothing.
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

    // Both wait on the network gate, which is already on screen. A second card
    // beneath it would read as a separate problem, and a wallet on an unsupported
    // network would be asked to connect one.
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
          destinationAddress={destinationAddress}
          busy={phase.kind === "sweeping"}
          busyAsset={phase.kind === "sweeping" ? phase.asset : undefined}
          // Switching mid-flow is the only way to arrive here blocked, and the
          // gate card explains it, so the buttons are simply disabled.
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
      // Retry is offered only when the machine retained enough for another
      // attempt; `reduce` ignores the event otherwise, so the button would be
      // inert.
      return (
        <ErrorCard
          message={phase.message}
          onRetry={phase.nskHex !== undefined && phase.chainId !== undefined ? onRetry : undefined}
        />
      );
  }
}
