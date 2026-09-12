import { Fragment, type ReactNode, Suspense } from "react";
import { chainKey } from "@/config/chains";
import { useActiveChainOrUndefined } from "@/features/chain";
import { ConnectedGate } from "@/features/wallet";
import { cx } from "@/shared/lib/cx";
import { Notice } from "@/shared/ui/Notice";
import { useChainChangeNotice } from "./use-chain-change-notice";
import "./ActionScreen.css";

export interface ActionScreenProps {
  children: ReactNode;
  /// Column width: `narrow` 560 (every single-card action), `wide` 1120 (Send by
  /// link's two columns), `vault` 900 (the claim-link vault).
  width?: "narrow" | "wide" | "vault";
}

function FormFallback() {
  return (
    <div role="status" aria-busy="true" aria-label="loading">
      <div className="skel skel--card" />
    </div>
  );
}

/// The shell every action route renders in: the connection gate, the chain-keyed
/// remount and its notice, and the Suspense fallback for the form's chunk.
///
/// Every action route needs the same three guarantees, so they are stated once
/// here rather than once per form.
///
/// The screen's own header — back button, title, boundary line — belongs to the
/// form, via `ActionForm.header`, because a review step replaces it.
export function ActionScreen({ children, width = "narrow" }: ActionScreenProps) {
  const chain = useActiveChainOrUndefined();
  const chainId = chain?.chainId;

  // Names the network just left, for a few seconds after a switch. The form
  // below is recreated on that switch — see the `<Fragment key>` comment — so
  // without this the user's typed input disappears with nothing said about it.
  const leftChain = useChainChangeNotice(
    chain ? { key: chainKey(chain.chainId), name: chain.chainName } : undefined,
  );

  // The same gate Home applies. Everything below it may call `useActiveChain`,
  // which throws without a connected, supported chain.
  return (
    <ConnectedGate>
      {() => (
        <div className={cx("screen", width !== "narrow" && `screen--${width}`, "gate-enter")}>
          {leftChain ? (
            <Notice title="Network changed">
              The form was reset — amounts and assets belong to the network they were entered on.
              You were on {leftChain}.
            </Notice>
          ) : null}
          <Suspense fallback={<FormFallback />}>
            {/* Keyed on the chain so a network switch recreates the form's
                react-hook-form state instead of carrying it across.
                Asset ids are only unique *within* a chain, so a retained `asset`
                silently rebinds: id 3 as USDC (6dp) on one chain becomes WBTC
                (8dp) on the next, and `findAsset` resolves it happily. `asEth` is
                worse — it survives to a chain with no `nativeAdapterAddress`,
                where the picker offers no eth option at all, so the select
                shows the first token while the form still holds `asEth: true`. */}
            <Fragment key={chainId === undefined ? "no-chain" : chainKey(chainId)}>
              {children}
            </Fragment>
          </Suspense>
        </div>
      )}
    </ConnectedGate>
  );
}
