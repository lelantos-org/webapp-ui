import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useActiveChain } from "@/features/chain";
import { plural } from "@/shared/lib/format/text";
import { Notice } from "@/shared/ui/Notice";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { daysLabel, describeStoredAmount } from "../copy";
import { selectVaultLinks } from "../policy";
import type { StoredClaimLink } from "../record";
import { useLinkAssetsFor, useLinkChainFor, useLinkVault } from "../use-link-vault";
import { VaultCapacity } from "./VaultCapacity";
import { VaultRow } from "./VaultRow";
import "./vault.css";

/// Rows shown before "Show all". The oldest, since they drop first.
const FIRST_ROWS = 5;

/// The `/links` screen.
export function ClaimLinkVault() {
  const listTitleId = useId();
  const { stored, pressure, memoryOnly, now } = useLinkVault();
  const chainFor = useLinkChainFor();
  const active = useActiveChain();
  const assetsFor = useLinkAssetsFor();
  const links = useMemo(() => selectVaultLinks(stored, now), [stored, now]);
  const [showAll, setShowAll] = useState(false);

  const chainNameOf = (link: StoredClaimLink): string | undefined =>
    link.chainId === active.chainId.toString()
      ? undefined
      : (chainFor(link)?.chainName ?? `chain ${link.chainId}`);

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
