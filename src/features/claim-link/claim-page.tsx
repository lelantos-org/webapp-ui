import { findChain } from "@/config/chains";
import { useChainRegistry } from "@/features/chain/ChainProvider";
import { ChainSwitchButtons } from "@/features/chain/ChainSwitchButtons";
import { describeChainMismatch } from "@/features/claim-link/chain-guard";
import { BalancesCard } from "@/features/claim-link/components/BalancesCard";
import { ConnectGate } from "@/features/claim-link/components/ConnectGate";
import {
  BadLinkCard,
  ClaimHero,
  DoneCard,
  ErrorCard,
  ReadingFragmentCard,
  ScanningCard,
} from "@/features/claim-link/components/StatusCards";
import {
  CLAIM_STEPS,
  heroSubtitleFor,
  linkChainIdOf,
  stepperStateFor,
} from "@/features/claim-link/phase-presenter";
import { useClaimFlow } from "@/features/claim-link/use-claim-flow";
import { useWallet } from "@/features/wallet";
import { Stepper } from "@/shared/ui/Stepper";

export function ClaimPage() {
  const { wallet, status, connect } = useWallet();
  const { phase, mismatch, claim } = useClaimFlow();
  const registry = useChainRegistry();
  const blocked = mismatch !== undefined;
  const { current, failed, done } = stepperStateFor(phase, blocked);

  // The link names its own chain, and the notes live only there. Labelling
  // them with the active chain's tokens — which is what a plain
  // `useRegisteredAssets()` gives — mislabels every asset whenever the wallet
  // is somewhere else.
  const linkChainId = linkChainIdOf(phase);
  const linkChain = linkChainId === undefined ? undefined : findChain(registry, linkChainId);
  const assets = linkChain?.tokens ?? [];

  return (
    <div className="stack claim-page">
      <ClaimHero subtitle={heroSubtitleFor(phase, blocked)} />

      <Stepper steps={CLAIM_STEPS} current={current} failed={failed} done={done} />

      {phase.kind === "reading-fragment" ? <ReadingFragmentCard /> : null}
      {phase.kind === "bad-link" ? <BadLinkCard error={phase.error} /> : null}
      {/* On a mismatch the switch card is the only thing to do next, so it
          replaces the connect gate rather than sitting under it — a wallet on
          an unsupported network otherwise reads as "not connected". */}
      {phase.kind === "need-wallet" && !mismatch ? (
        <ConnectGate status={status} onConnect={connect} />
      ) : null}
      {phase.kind === "loading" ? <ScanningCard /> : null}
      {mismatch ? (
        <div className="card stack stack--sm">
          <p className="muted txt-sm">{describeChainMismatch(mismatch)}</p>
          <p className="muted txt-xs">
            switch to {mismatch.link.chainName} to claim — the notes can only be spent there.
          </p>
          <ChainSwitchButtons only={mismatch.link.chainId} />
        </div>
      ) : null}
      {phase.kind === "ready" || phase.kind === "sweeping" ? (
        <BalancesCard
          balances={phase.balances}
          assets={assets}
          destinationAddress={wallet?.address}
          busy={phase.kind === "sweeping"}
          busyAsset={phase.kind === "sweeping" ? phase.asset : undefined}
          blockedReason={mismatch ? `switch to ${mismatch.link.chainName} first` : undefined}
          onClaim={claim}
        />
      ) : null}
      {phase.kind === "done" ? (
        <DoneCard
          txHash={phase.txHash}
          asset={phase.asset}
          amount={phase.amount}
          assets={assets}
          destinationAddress={wallet?.address}
        />
      ) : null}
      {phase.kind === "error" ? <ErrorCard message={phase.message} /> : null}
    </div>
  );
}
