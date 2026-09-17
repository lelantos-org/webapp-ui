import { Fragment, type ReactNode, Suspense } from "react";
import { chainKey } from "@/config/chains";
import { useActiveChainOrUndefined } from "@/features/chain";
import { ConnectedGate } from "@/features/wallet";
import { cx } from "@/shared/lib/cx";
import { Notice } from "@/shared/ui/Notice";
import { LoadingFallback } from "./LoadingFallback";
import { useChainChangeNotice } from "./use-chain-change-notice";
import "./ActionScreen.css";

export interface ActionScreenProps {
  children: ReactNode;
  width?: "narrow" | "wide" | "vault";
}

/// Shell for every action route: connection gate, chain-keyed remount with its notice, and Suspense.
export function ActionScreen({ children, width = "narrow" }: ActionScreenProps) {
  const chain = useActiveChainOrUndefined();
  const chainId = chain?.chainId;

  const leftChain = useChainChangeNotice(
    chain ? { key: chainKey(chain.chainId), name: chain.chainName } : undefined,
  );

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
          <Suspense fallback={<LoadingFallback />}>
            {/* Keyed on chain: asset ids are per-chain, so carried form state would silently rebind. */}
            <Fragment key={chainId === undefined ? "no-chain" : chainKey(chainId)}>
              {children}
            </Fragment>
          </Suspense>
        </div>
      )}
    </ConnectedGate>
  );
}
