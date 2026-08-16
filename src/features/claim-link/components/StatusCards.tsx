import { Link } from "react-router-dom";
import { findAsset, type RegisteredAsset } from "@/features/assets/registered-assets";
import { useTxExplorerUrl } from "@/features/chain/use-explorer-url";
import { formatAmountForAsset, shortAddr } from "@/shared/lib/format";

export function ClaimHero({ subtitle }: { subtitle?: string }) {
  return (
    <div className="hero claim-hero">
      <div>
        <div className="hero__eyebrow"></div>
        <h1 className="hero__t">claim shielded funds</h1>
        <p className="hero__sub muted">
          {subtitle ?? "funds will be swept to your connected shielded address."}
        </p>
      </div>
      <div className="claim-hero__glyph" aria-hidden>
        <span className="claim-hero__bracket">[</span>
        <span className="claim-hero__core">$</span>
        <span className="claim-hero__bracket">]</span>
      </div>
    </div>
  );
}

export function ReadingFragmentCard() {
  return (
    <div className="card claim-state">
      <div className="claim-state__row">
        <span className="spinner" aria-hidden />
        <div>
          <div className="claim-state__t">decoding bearer secret</div>
          <div className="muted txt-sm">parsing 32-byte fragment from URL hash…</div>
        </div>
      </div>
    </div>
  );
}

export function ScanningCard() {
  return (
    <div className="card claim-state">
      <div className="claim-state__row">
        <span className="spinner" aria-hidden />
        <div className="claim-state__grow">
          <div className="claim-state__t">scanning chain for note</div>
          <div className="muted txt-sm">
            walking commitment tree · trial-decrypting up to 500 notes…
          </div>
        </div>
        <span className="dot dot--idle" aria-hidden />
      </div>
      <div className="claim-skel">
        <div className="skel skel--row" />
        <div className="skel skel--row" style={{ width: "82%" }} />
        <div className="skel skel--row" style={{ width: "64%" }} />
      </div>
    </div>
  );
}

export function BadLinkCard({ error }: { error: string }) {
  return (
    <div className="card claim-bad">
      <div className="claim-bad__mark" aria-hidden>
        ×
      </div>
      <div className="stack stack--sm">
        <div className="claim-bad__t">bad link</div>
        <div className="muted txt-sm">{error}</div>
        <div className="muted txt-xs">
          ask the sender to regenerate. each claim link is single-use and bearer-only.
        </div>
        <div className="row">
          <Link to="/" className="btn">
            home
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ErrorCard({ message }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card claim-bad">
      <div className="claim-bad__mark" aria-hidden>
        !
      </div>
      <div className="stack stack--sm">
        <div className="claim-bad__t">claim failed</div>
        <div className="err">{message}</div>
        <div className="row">
          <Link to="/" className="btn">
            home
          </Link>
        </div>
      </div>
    </div>
  );
}

export interface DoneCardProps {
  txHash: string;
  asset: bigint;
  amount: bigint;
  assets?: readonly RegisteredAsset[];
  destinationAddress?: string;
}

export function DoneCard({ txHash, asset, amount, assets, destinationAddress }: DoneCardProps) {
  const a = findAsset(assets, asset);
  const symbol = a?.symbol ?? `asset#${asset.toString()}`;
  const formatted = a ? formatAmountForAsset(amount, a.decimals, a.scale) : amount.toString();
  const explorer = useTxExplorerUrl()(txHash);
  return (
    <div className="card claim-done">
      <div className="claim-done__check" aria-hidden>
        ✓
      </div>
      <div className="claim-done__eyebrow"></div>
      <div className="claim-done__amt">
        <span className="claim-done__num mono">{formatted}</span>
        <span className="claim-done__sym">{symbol}</span>
      </div>
      <div className="claim-done__meta muted txt-xs">
        {destinationAddress ? (
          <div>
            destination <span className="mono">{shortAddr(destinationAddress, 6)}</span>
          </div>
        ) : null}
        <div>
          tx{" "}
          {explorer ? (
            <a
              href={explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="mono claim-done__txlink"
            >
              {shortAddr(txHash, 8)}
            </a>
          ) : (
            <span className="mono">{shortAddr(txHash, 8)}</span>
          )}
        </div>
      </div>
      <div className="claim-actions">
        <Link to="/" className="btn btn--xl">
          back home
        </Link>
      </div>
    </div>
  );
}
