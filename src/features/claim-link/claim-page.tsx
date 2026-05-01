import { useRegisteredAssets } from "@/features/assets/registered-assets";
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
  stepperStateFor,
} from "@/features/claim-link/phase-presenter";
import { useClaimFlow } from "@/features/claim-link/use-claim-flow";
import { useWallet } from "@/features/wallet";
import { Stepper } from "@/shared/ui/Stepper";

export function ClaimPage() {
  const { wallet, status, chainOk, connect, switchChain } = useWallet();
  const { phase, claim } = useClaimFlow();
  const assets = useRegisteredAssets();
  const { current, failed, done } = stepperStateFor(phase);

  return (
    <div className="stack claim-page">
      <ClaimHero subtitle={heroSubtitleFor(phase)} />

      <Stepper steps={CLAIM_STEPS} current={current} failed={failed} done={done} />

      {phase.kind === "reading-fragment" ? <ReadingFragmentCard /> : null}
      {phase.kind === "bad-link" ? <BadLinkCard error={phase.error} /> : null}
      {phase.kind === "need-wallet" ? (
        <ConnectGate
          status={status}
          chainOk={chainOk}
          onConnect={connect}
          onSwitchChain={switchChain}
        />
      ) : null}
      {phase.kind === "loading" ? <ScanningCard /> : null}
      {phase.kind === "ready" || phase.kind === "sweeping" ? (
        <BalancesCard
          balances={phase.balances}
          assets={assets.data}
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
          assets={assets.data}
          destinationAddress={wallet?.address}
        />
      ) : null}
      {phase.kind === "error" ? <ErrorCard message={phase.message} /> : null}
    </div>
  );
}
