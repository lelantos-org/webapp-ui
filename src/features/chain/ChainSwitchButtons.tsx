import type { ChainEntry } from "@/config/chains";
import { useSwitchChain } from "@/features/eip1193";
import { ChainIcon } from "@/features/icons";
import { useActiveChainOrUndefined, useChainRegistry } from "./ChainProvider";

export interface ChainSwitchButtonsProps {
  /// Restrict the offer to one chain — used when a claim link names the chain
  /// it belongs to. Omitted, every chain the deployment serves is offered.
  only?: bigint;
  /// Centred for the full-screen Welcome panel; `"start"` to line the buttons
  /// up with the text of a card body. Asked for here rather than overridden
  /// from the outside, so this component still owns its own layout.
  align?: "center" | "start";
}

/// Buttons that move the *wallet* to a supported chain.
///
/// Not a chain picker: there is no app-level chain to pick. Each button calls
/// `wallet_switchEthereumChain`, so the wallet remains the single source of
/// truth and the app simply follows. That is why this replaced the header
/// dropdown — the dropdown implied the app had a chain of its own.
///
/// The chain the wallet is already on is omitted rather than disabled: an
/// inert button invites a click that does nothing.
export function ChainSwitchButtons({ only, align = "center" }: ChainSwitchButtonsProps) {
  const registry = useChainRegistry();
  const switchChain = useSwitchChain();
  // `undefined` on an unsupported network, which is exactly when every chain
  // should be offered.
  const active = useActiveChainOrUndefined();

  const offered = registry.filter(
    (c) => (only === undefined || c.chainId === only) && c.chainId !== active?.chainId,
  );
  if (offered.length === 0) return null;

  return (
    <div className={`row row--center row--wrap${align === "start" ? " row--start" : ""}`}>
      {offered.map((c: ChainEntry) => (
        <button
          key={c.chainId.toString()}
          type="button"
          className="btn"
          onClick={() => switchChain(c)}
        >
          <ChainIcon chainId={c.chainId} chainName={c.chainName} />
          switch to {c.chainName}
        </button>
      ))}
    </div>
  );
}
