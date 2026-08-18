import type { RegisteredAsset } from "@/features/assets/registered-assets";
import type { ChainMismatch } from "@/features/claim-link/chain-guard";
import { BalancesCard } from "@/features/claim-link/components/BalancesCard";
import { ConnectGate } from "@/features/claim-link/components/ConnectGate";
import { NetworkGateCard } from "@/features/claim-link/components/NetworkGateCard";
import {
  BadLinkCard,
  ClaimHero,
  DoneCard,
  ErrorCard,
  ReadingFragmentCard,
  ScanningCard,
} from "@/features/claim-link/components/StatusCards";
import type { Phase } from "@/features/claim-link/phase-machine";
import {
  CLAIM_STEPS,
  heroSubtitleFor,
  stepperStateFor,
} from "@/features/claim-link/phase-presenter";
import { useClaimFlow } from "@/features/claim-link/use-claim-flow";
import { useWallet } from "@/features/wallet";
import type { WalletStatus } from "@/features/wallet/types";
import { Stepper } from "@/shared/ui/Stepper";

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
        // The link names its own chain, and the notes live only there, so the
        // labels come from it rather than from whatever chain the wallet is on.
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
/// A switch rather than a run of `phase.kind === …` lines: it returns on every
/// phase, so adding one to the machine is a compile error here instead of a
/// screen that silently renders nothing.
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
      return <BadLinkCard error={phase.error} />;

    // Both wait on the network gate, which is already on screen saying so. A
    // second card under it would read as a second, separate problem — and a
    // wallet parked on an unsupported network would be asked to connect one.
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
          // Switching mid-flow is the only way to arrive here blocked; the
          // gate card explains it, so the buttons only go quiet.
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
      // Retry is offered only when the machine kept enough to make another
      // attempt; `reduce` ignores the event otherwise, and a dead button is
      // worse than none.
      return (
        <ErrorCard
          message={phase.message}
          onRetry={phase.nskHex !== undefined && phase.chainId !== undefined ? onRetry : undefined}
        />
      );
  }
}
