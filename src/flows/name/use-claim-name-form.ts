import type { WalletApi } from "@lelantos-org/sdk";
import { type FormEvent, useState } from "react";
import type { ChainEntry } from "@/config/chains";
import { handleName, useClaimedHandle } from "@/features/names";
import { useClearFinishedOp } from "@/features/op-form";
import { useWalletState } from "@/features/wallet";
import { nameSubmitBlock } from "./name-block";
import { registrationCard } from "./outcome";
import { useHandleEntry } from "./use-handle-entry";
import { usePublishedAddress } from "./use-published-address";
import { useRegisterName } from "./use-register-name";
import { useRegistrationFunding } from "./use-registration-funding";
import { useRegistrationOutcome } from "./use-registration-outcome";

/// Everything the claim screen decides: the handle, what pays for it, why Claim is held, and what
/// became of a claim that landed.
export function useClaimNameForm(chain: ChainEntry, wallet: WalletApi) {
  const { mutation, progress } = useRegisterName();
  const clearFinished = useClearFinishedOp(mutation, progress);
  const entry = useHandleEntry(chain);
  const funding = useRegistrationFunding(chain);
  const published = usePublishedAddress(chain.chainId, wallet);
  const { error: syncError } = useWalletState();
  const { handle } = entry;
  const { asset } = funding;

  /// The label the publish confirmation was ticked for: editing the handle asks again.
  const [ackFor, setAckFor] = useState<string | undefined>(undefined);
  const acknowledged = handle !== undefined && ackFor === handle.label;

  const block = nameSubmitBlock({
    syncErrored: !!syncError,
    balancesLoading: funding.balancesLoading,
    handle: entry.status,
    fee: funding.registrarFee.state,
    fundingProblem: funding.problem,
    addressShown: published.data !== undefined,
    acknowledged,
  });

  const claimed = useClaimedHandle(chain.chainId, wallet.address);
  const outcome = useRegistrationOutcome(chain, wallet.address, mutation.data);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (block.disabled || mutation.isPending || !handle || !asset) return;
    mutation.mutateAsync({ label: handle.label, asset: asset.id }).then(
      () => {
        entry.setText("");
        setAckFor(undefined);
      },
      // The failure card shows it.
      () => {},
    );
  };

  return {
    mutation,
    progress,
    clearFinished,
    onSubmit,
    block,
    /// Why nothing here can pay for a claim; the form is not offered then.
    unavailable: funding.unavailable,
    text: entry.text,
    setText: (next: string) => {
      clearFinished();
      entry.setText(next);
    },
    handle,
    status: entry.status,
    recheck: entry.recheck,
    published,
    acknowledged,
    acknowledge: (checked: boolean) => setAckFor(checked ? handle?.label : undefined),
    asset,
    registrarFee: funding.registrarFee,
    relayerFee: funding.relayerFee,
    retryRegistrarFee: funding.retryRegistrarFee,
    /// Set where registration is free: the asset is then the user's to pick.
    paidFrom: funding.choice && {
      ...funding.choice,
      onChange: (next: string) => {
        clearFinished();
        funding.choose(next);
      },
    },
    /// The handle this account already holds.
    claimed: claimed && {
      label: claimed.label,
      name: handleName(claimed.label, chain.nameParents),
    },
    /// The card of a claim that landed.
    landed: mutation.data && outcome ? registrationCard(mutation.data, outcome, chain) : undefined,
  };
}
