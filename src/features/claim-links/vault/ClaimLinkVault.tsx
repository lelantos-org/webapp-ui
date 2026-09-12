// The claim-link vault screen. Send by link
// borrows two pieces of the vault from beside this file: `VaultSummary` under
// its share column and `EvictionBlock` over "Create link".
//
// A claim link's spending key exists only in the URL the sender holds.
// `link-vault` writes the record before the transfer goes out, and this screen
// is where the sender recovers it, saves it to a file, or deletes it. Nothing
// here can observe whether the recipient has claimed, so the list is the
// sender's to curate and the TTL is only a backstop.

import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { findChain } from "@/config/chains";
import { useActiveChain, useChainRegistry } from "@/features/chain";
import { plural } from "@/shared/lib/text";
import { Notice } from "@/shared/ui/Notice";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { selectVaultLinks } from "../link-vault/policy";
import type { StoredClaimLink } from "../link-vault/record";
import { useLinkAssetsFor, useLinkVault } from "../use-link-vault";
import { daysLabel, describeStoredAmount } from "../vault-copy";
import { VaultCapacity } from "./VaultCapacity";
import { VaultRow } from "./VaultRow";
import "./vault.css";

/// Rows shown before "Show all". The oldest, since they drop first.
const FIRST_ROWS = 5;

/// The `/links` screen.
export function ClaimLinkVault() {
  const listTitleId = useId();
  const { stored, pressure, memoryOnly, now } = useLinkVault();
  const registry = useChainRegistry();
  const active = useActiveChain();
  const assetsFor = useLinkAssetsFor();
  const links = useMemo(() => selectVaultLinks(stored, now), [stored, now]);
  const [showAll, setShowAll] = useState(false);

  // A row on another network names it, because its amount is labelled from that
  // network's tokens and a copy of it claims only there.
  const chainNameOf = (link: StoredClaimLink): string | undefined =>
    link.chainId === active.chainId.toString()
      ? undefined
      : (findChain(registry, BigInt(link.chainId))?.chainName ?? `chain ${link.chainId}`);

  const shown = showAll ? links : links.slice(0, FIRST_ROWS);

  return (
    <>
      <ScreenHeader
        title="Links you have not seen claimed"
        subtitle="Each row holds a spending key. Whoever opens the link takes the funds — so this list is the only copy you have, and it lives in this browser alone."
        backTo="/send/link"
        backLabel="Back to Send by link"
      />

      {memoryOnly ? (
        <Notice tone="err" title="This browser is not saving these links" announce="alert">
          Storage refused the last write, so every link below lives only as long as this tab. Export
          them before you close it.
        </Notice>
      ) : null}

      <VaultCapacity pressure={pressure} links={links} />

      <section className="surface vault-list" aria-labelledby={listTitleId}>
        <div className="vault-list__hdr">
          <h2 className="vault-list__t" id={listTitleId}>
            Oldest first — these go first
          </h2>
          <span className="vault-list__count">
            {plural(links.length, "link")}
            {links.length > shown.length ? ` · ${shown.length} shown` : ""}
          </span>
        </div>
        <div className="vault-list__body">
          {links.length === 0 ? (
            <p className="vault-list__empty">
              No links in this browser. Each one you create with{" "}
              <Link to="/send/link">Send by link</Link> is kept here for {daysLabel(pressure.ttlMs)}{" "}
              or until you delete it.
            </p>
          ) : (
            <ul className="vault-list__rows">
              {shown.map((link) => (
                <VaultRow
                  key={link.id}
                  link={link}
                  amount={describeStoredAmount(link, assetsFor(link))}
                  chainName={chainNameOf(link)}
                  now={now}
                />
              ))}
            </ul>
          )}
          {links.length > shown.length ? (
            <button
              type="button"
              className="link-btn vault-list__more"
              onClick={() => setShowAll(true)}
            >
              Show all {links.length}
            </button>
          ) : null}
          <p className="vault-list__foot">
            Deleting removes your copy and nothing else. It does not revoke the link, and anyone
            still holding one can claim the funds. Nothing here can tell you whether a link has been
            claimed — the pool does not report it, so this list is yours to curate.
          </p>
        </div>
      </section>
    </>
  );
}
