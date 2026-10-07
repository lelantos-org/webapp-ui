import type { WalletApi } from "@lelantos-org/sdk";
import { Link } from "react-router-dom";
import type { ChainEntry } from "@/config/chains";
import { useActiveChain, useChainRegistry } from "@/features/chain";
import { handleName, registrarChain } from "@/features/names";
import { ActionForm, type SettledOutcome, SpendNotices } from "@/features/op-form";
import { operationOf } from "@/features/tx";
import { useWalletInstance } from "@/features/wallet";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { ClaimedHandle } from "./components/ClaimedHandle";
import { HandleField } from "./components/HandleField";
import { NameUnavailable } from "./components/NameUnavailable";
import { PublishPanel } from "./components/PublishPanel";
import { RegistrationFees } from "./components/RegistrationFees";
import type { RegistrationCard } from "./outcome";
import { useClaimNameForm } from "./use-claim-name-form";
import "./name.css";

const HEADER = (
  <ScreenHeader
    title="Claim a handle"
    subtitle="A public name that points to one of your shielded addresses, so people can pay you by name."
  />
);

const STILL_PAYABLE = "Handles that are already claimed can still be looked up and paid.";

/// Claim a handle: publish a shielded address of this account under a public name, paid from
/// shielded funds.
export function ClaimNameForm() {
  const chain = useActiveChain();
  const wallet = useWalletInstance();
  const elsewhere = registrarChain(useChainRegistry());

  if (!chain.nameRegistrarAddress) {
    return (
      <NameUnavailable
        header={HEADER}
        reason={`${chain.chainName} has no handle registrar, so there is nothing to claim on it.`}
        advice={
          elsewhere
            ? `Handles are offered on ${elsewhere.chainName}. Switch network to claim one.`
            : undefined
        }
      />
    );
  }
  if (!wallet?.capabilities.registerName) {
    return (
      <NameUnavailable
        header={HEADER}
        reason="This wallet can't claim a handle here. A claim is a shielded transaction that needs a prover and a relayer that carries it, and one of them is missing on this network."
        advice={STILL_PAYABLE}
      />
    );
  }
  return <ClaimNameScreen chain={chain} wallet={wallet} />;
}

function ClaimNameScreen({ chain, wallet }: { chain: ChainEntry; wallet: WalletApi }) {
  const form = useClaimNameForm(chain, wallet);
  const { mutation, handle, published, claimed } = form;

  if (form.unavailable !== undefined) {
    return <NameUnavailable header={HEADER} reason={form.unavailable} advice={STILL_PAYABLE} />;
  }

  return (
    <ActionForm
      header={HEADER}
      submitLabel={handle ? `Claim ${handle.name}` : "Claim handle"}
      busy={mutation.isPending}
      error={mutation.error}
      onSubmit={form.onSubmit}
      submitDisabled={form.block.disabled}
      blockedReason={form.block.reason}
      footnote="Proved on this device and sent by the relayer. No public account signs or pays."
      progress={form.progress}
      txHash={mutation.data?.txHash}
      operation={operationOf(mutation.data)}
      onReset={form.clearFinished}
      tx={{
        progressTitle: "Claiming your handle",
        failedTitle: "Couldn't claim the handle",
        amount: handle?.name,
        settled: form.landed && settledOutcome(form.landed),
      }}
      after={(view) => (claimed && view === "form" ? <ClaimedHandle handle={claimed} /> : null)}
    >
      <SpendNotices />
      <HandleField
        value={form.text}
        onChange={form.setText}
        status={form.status}
        example={handleName("mehow", chain.nameParents)}
        onRetryCheck={form.recheck}
      />
      <hr className="rule" />
      <PublishPanel
        name={handle?.name}
        address={published.data}
        addressFailed={published.isError}
        onRetryAddress={() => void published.refetch()}
        acknowledged={form.acknowledged}
        onAcknowledge={form.acknowledge}
      />
      <hr className="rule" />
      <RegistrationFees
        registrarFee={form.registrarFee}
        relayerFee={form.relayerFee}
        onRetryRegistrarFee={form.retryRegistrarFee}
        symbol={form.asset?.symbol}
        paidFrom={form.paidFrom}
      />
    </ActionForm>
  );
}

function settledOutcome({ title, unconfirmed, note, profile }: RegistrationCard): SettledOutcome {
  return {
    title,
    unconfirmed,
    note,
    action: profile ? (
      <Link to={profile.to} className="btn btn--cta btn--sm">
        {profile.text}
      </Link>
    ) : undefined,
  };
}
