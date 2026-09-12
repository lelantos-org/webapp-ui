import { Link } from "react-router-dom";
import type { RegisteredAsset } from "@/config/chains";
import { Notice } from "@/shared/ui/Notice";
import type { ClaimLinkPressure } from "../link-vault/policy";
import type { StoredClaimLink } from "../link-vault/record";
import { evictionSentence } from "../vault-copy";
import { exportAllClaimLinks } from "./VaultCapacity";
import "./EvictionBlock.css";

export interface EvictionBlockProps {
  pressure: ClaimLinkPressure;
  /// Labels the record about to drop from its own network's tokens.
  assetsFor(link: StoredClaimLink): readonly RegisteredAsset[];
  /// The user has saved a copy, which is what lifts the block.
  onExported(): void;
}

/// Over "Create link" when the vault is full: which record the new link would
/// drop, and the one step that makes dropping it safe.
export function EvictionBlock({ pressure, assetsFor, onExported }: EvictionBlockProps) {
  const record = pressure.nextEvicted;
  if (!record) return null;
  return (
    <Notice
      tone="err"
      actionPlacement="below"
      action={
        <span className="evict__actions">
          <button
            type="button"
            className="btn btn--outline btn--outline-err"
            onClick={() => {
              exportAllClaimLinks();
              onExported();
            }}
          >
            Export first
          </button>
          <Link to="/links" className="evict__link">
            Open the vault
          </Link>
        </span>
      }
    >
      {evictionSentence(record, assetsFor(record))}
    </Notice>
  );
}
