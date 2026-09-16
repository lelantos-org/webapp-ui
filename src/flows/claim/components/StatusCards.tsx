import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { RegisteredAsset } from "@/config/chains";
import { findAsset } from "@/features/assets";
import { useTxExplorerUrl } from "@/features/chain";
import { shortAddr } from "@/shared/lib/address";
import { cx } from "@/shared/lib/cx";
import { formatAmountForAsset } from "@/shared/lib/format/asset";
import { TxFailedCard } from "@/shared/ui/tx-cards/TxFailedCard";
import { TxSettledCard } from "@/shared/ui/tx-cards/TxSettledCard";
import type { BadLinkReason } from "../phase-machine";
import "./claim-cards.css";

function WaitCard({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return (
    <section className="surface surface--card claim-card" aria-busy="true">
      <div className="claim-wait">
        <span className="spinner" aria-hidden />
        <div>
          <div className="claim-card__t">{title}</div>
          <div className="claim-card__sub">{sub}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

export function ReadingFragmentCard() {
  return <WaitCard title="Reading your link" sub="Just a moment." />;
}

export function ScanningCard() {
  return (
    <WaitCard title="Finding your funds" sub="This usually takes a few seconds.">
      <div className="claim-skel" aria-hidden>
        <div className="skel skel--row" />
        <div className="skel skel--row" style={{ width: "72%" }} />
      </div>
    </WaitCard>
  );
}

/// Two failures sharing one card.
///
/// `missing` is almost always a reload: the page strips the fragment from the
/// address bar on mount so the secret never reaches history, which means the
/// reloaded URL no longer carries it. Nothing is lost, since the original link
/// still works, so this is a warning rather than an error — as with the network
/// gate, the flow has stopped but nothing has broken.
export function BadLinkCard({ error, reason }: { error: string; reason: BadLinkReason }) {
  const missing = reason === "missing";
  return (
    <section
      className={cx(
        "surface surface--card claim-card",
        missing ? "claim-card--warn" : "claim-card--err",
      )}
    >
      <div className="claim-card__head">
        <h2 className="claim-card__t">
          {missing ? "No claim code in this link" : "This link isn't valid"}
        </h2>
        {missing ? (
          <p className="claim-card__sub">
            The claim code is stripped from the address bar the moment this page opens, so it never
            reaches your history — which is also why a reload cannot bring it back. Open the
            original link again.
          </p>
        ) : (
          <>
            <p className="claim-card__sub claim-card__msg">{error}</p>
            <p className="claim-card__sub">
              Ask the sender for a new link. Each one works once, for whoever opens it.
            </p>
          </>
        )}
      </div>
      <Link to="/" className="btn btn--outline">
        Back home
      </Link>
    </section>
  );
}

/// `onRetry` must be rendered wherever it is supplied. The URL fragment is
/// scrubbed on mount, so a reload destroys the secret rather than recovering it,
/// and without a retry a transient RPC error during the scan would be terminal.
///
/// The reassurance is stage-aware and claims only what is true at that stage: a
/// failed scan moved nothing, and a failed sweep leaves whatever was not claimed
/// at the link — which a retry rescans rather than assuming, and which the pool
/// will not let anyone spend twice.
export function ClaimErrorCard({
  message,
  from,
  onRetry,
}: {
  message: string;
  from: "scan" | "sweep";
  onRetry?: (() => void) | undefined;
}) {
  const sweep = from === "sweep";
  return (
    <TxFailedCard
      title={sweep ? "Couldn't claim" : "Couldn't find the funds"}
      message={message}
      reassurance={
        sweep
          ? "Whatever wasn't claimed is still at the link. Trying again looks at the link afresh, and each note can only ever be claimed once."
          : "Nothing has moved. Keep this page open — the claim code is gone from the address bar, so a reload cannot bring it back."
      }
      onRetry={onRetry}
    />
  );
}

export interface DoneCardProps {
  txHash: string;
  asset: bigint;
  amount: bigint;
  assets?: readonly RegisteredAsset[];
  destinationAddress?: string | undefined;
}

export function DoneCard({ txHash, asset, amount, assets, destinationAddress }: DoneCardProps) {
  const a = findAsset(assets, asset);
  const symbol = a?.symbol ?? `asset#${asset.toString()}`;
  const formatted = a ? formatAmountForAsset(amount, a) : amount.toString();
  const explorer = useTxExplorerUrl()(txHash);
  return (
    <TxSettledCard
      title="Claimed"
      amount={`${formatted} ${symbol}`}
      hash={txHash}
      explorerUrl={explorer}
      note={
        destinationAddress
          ? `Now in your shielded wallet, ${shortAddr(destinationAddress, 6)}.`
          : "Now in your shielded wallet."
      }
      action={
        <Link to="/" className="btn btn--outline btn--sm">
          Go to your wallet
        </Link>
      }
    />
  );
}
