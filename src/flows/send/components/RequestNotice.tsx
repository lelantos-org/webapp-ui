import { findChain } from "@/config/chains";
import { useChainRegistry } from "@/features/chain";
import type { RequestState } from "@/features/payment-request";
import { useSwitchChain } from "@/features/wallet-kinds";
import { Notice } from "@/shared/ui/Notice";

/// What the Send form says about the payment request it was opened with; nothing when there is none.
export function RequestNotice({ state }: { state: RequestState }) {
  switch (state.status) {
    case "none":
      return null;
    case "invalid":
      return (
        <Notice title="This payment request can't be read">
          The link is incomplete or was changed on the way. Ask for a new one, or fill the form in
          yourself.
        </Notice>
      );
    case "unlisted-asset":
      return (
        <Notice title="This payment request can't be paid here">
          It asks for an asset this network does not list. Ask for a new link.
        </Notice>
      );
    case "other-chain":
      return <OtherChainNotice chainId={state.chainId} />;
    case "ready":
      return (
        <Notice
          tone="neutral"
          title={`Payment request · ${state.request.amount} ${state.asset.symbol}`}
        >
          The amount, asset and address came from the link you opened. Pay it only if you know who
          sent it.
        </Notice>
      );
  }
}

function OtherChainNotice({ chainId }: { chainId: bigint }) {
  const chain = findChain(useChainRegistry(), chainId);
  const switchChain = useSwitchChain();

  if (!chain) {
    return (
      <Notice title="This payment request is for another network">
        It was made on a network this app does not serve (chain {chainId.toString()}), so it cannot
        be paid from here.
      </Notice>
    );
  }
  return (
    <Notice
      title={`This payment request is for ${chain.chainName}`}
      actionLabel={`Switch to ${chain.chainName}`}
      onAction={() => switchChain(chain)}
      actionPlacement="below"
    >
      Switch network and the form fills in.
    </Notice>
  );
}
