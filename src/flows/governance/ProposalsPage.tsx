import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useNowSeconds, useProposalList, useVotingPower } from "@/features/governance";
import { cx } from "@/shared/lib/cx";
import { Notice } from "@/shared/ui/Notice";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { GovernorGate } from "./components/GovernorGate";
import { ProposalRow } from "./components/ProposalRow";
import { VotingPowerCard } from "./components/VotingPowerCard";
import "./governance.css";

type Filter = "active" | "all";

/// `/governance`: the proposals, newest first, and this account's voting power.
export function ProposalsPage() {
  return (
    <GovernorGate>
      <Proposals />
    </GovernorGate>
  );
}

function Proposals() {
  const listId = useId();
  const [filter, setFilter] = useState<Filter>("active");
  const list = useProposalList();
  const power = useVotingPower();
  const now = useNowSeconds(5_000);
  const decimals = power.data?.decimals ?? 18;
  const symbol = power.data?.symbol ?? "LNT";

  const shown =
    filter === "all" ? list.items : list.items.filter((p) => p.chain?.state === "Active");

  return (
    <>
      <ScreenHeader
        title="Governance"
        subtitle="LNT holders decide changes to the protocol. Votes are weighed at each proposal's snapshot."
        right={
          <Link to="/governance/new" className="btn btn--outline btn--sm gov-new">
            New proposal
          </Link>
        }
      />
      <VotingPowerCard />
      <section className="surface gov-list" aria-labelledby={listId}>
        <div className="gov-list__hdr">
          <h2 className="gov-list__t" id={listId}>
            Proposals
          </h2>
          <fieldset className="gov-filter">
            <legend className="sr-only">Show</legend>
            {(
              [
                ["active", "Active"],
                ["all", "All"],
              ] as const
            ).map(([f, label]) => (
              <button
                key={f}
                type="button"
                className={cx("gov-filter__btn", filter === f && "gov-filter__btn--on")}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {label}
              </button>
            ))}
          </fieldset>
        </div>
        <div className="gov-list__body">
          {list.error ? (
            <Notice tone="err" title="Could not load proposals" className="gov-list__notice">
              The governance index did not answer. Try again in a moment.
            </Notice>
          ) : list.isLoading ? (
            <p className="muted gov-list__empty">Loading proposals…</p>
          ) : shown.length === 0 ? (
            <p className="muted gov-list__empty">
              {filter === "active" && list.items.length > 0
                ? "No proposal is open for voting right now."
                : "No proposals yet."}
              {filter === "active" && list.items.length > 0 ? (
                <>
                  {" "}
                  <button type="button" className="link-btn" onClick={() => setFilter("all")}>
                    Show all
                  </button>
                </>
              ) : null}
            </p>
          ) : (
            <ul className="gov-list__rows">
              {shown.map((p) => (
                <ProposalRow
                  key={p.id}
                  proposal={p}
                  now={now}
                  decimals={decimals}
                  symbol={symbol}
                />
              ))}
            </ul>
          )}
          {list.hasMore ? (
            <button
              type="button"
              className="link-btn gov-list__more"
              disabled={list.loadingMore}
              onClick={list.loadMore}
            >
              {list.loadingMore ? "Loading…" : "Load older proposals"}
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}
