import { findChain } from "@/config/chains";
import { useActiveChainOrUndefined, useChainRegistry } from "@/features/chain/ChainProvider";
import { ChainSwitchButtons } from "@/features/chain/ChainSwitchButtons";
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
  const { phase, claim } = useClaimFlow();
  const registry = useChainRegistry();
  const active = useActiveChainOrUndefined();
  const { current, failed, done } = stepperStateFor(phase);

  // The link names its own chain, and the notes live only there. Labelling
  // them with the active chain's tokens — which is what a plain
  // `useRegisteredAssets()` gives — mislabels every asset whenever the wallet
  // is somewhere else.
  const linkChainId = linkChainIdOf(phase);
  const linkChain = linkChainId === undefined ? undefined : findChain(registry, linkChainId);
  const assets = linkChain?.tokens ?? [];

  // Sweeping signs against the link's chain, so the wallet has to be on it.
  const needsSwitch =
    linkChain !== undefined && active !== undefined && active.chainId !== linkChain.chainId;

  return (
    <div className="stack claim-page">
      <ClaimHero subtitle={heroSubtitleFor(phase)} />

      <Stepper steps={CLAIM_STEPS} current={current} failed={failed} done={done} />

      {phase.kind === "reading-fragment" ? <ReadingFragmentCard /> : null}
      {phase.kind === "bad-link" ? <BadLinkCard error={phase.error} /> : null}
      {phase.kind === "need-wallet" ? <ConnectGate status={status} onConnect={connect} /> : null}
      {phase.kind === "loading" ? <ScanningCard /> : null}
      {needsSwitch && linkChain ? (
        <div className="card stack stack--sm">
          <p className="muted txt-sm">
            this link holds funds on {linkChain.chainName}; your wallet is on {active?.chainName}.
          </p>
          <ChainSwitchButtons only={linkChain.chainId} />
        </div>
      ) : null}
      {phase.kind === "ready" || phase.kind === "sweeping" ? (
        <BalancesCard
          balances={phase.balances}
          assets={assets}
          destinationAddress={wallet?.address}
          busy={phase.kind === "sweeping"}
          busyAsset={phase.kind === "sweeping" ? phase.asset : undefined}
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
