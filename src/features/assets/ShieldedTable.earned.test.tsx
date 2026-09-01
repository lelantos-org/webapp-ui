// The `earned` column's four states. The arithmetic behind it is covered in
// `yield-gains.test.ts`; what matters here is that a wallet is never told
// something the data does not support — a plain asset must not read as
// "unknown", and an unresolved basis must not read as "+0".

import { RAY } from "@lelantos-org/sdk";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { RegisteredAsset } from "@/config/chains";
import { ShieldedTable } from "./ShieldedTable";
import type { AssetBalanceView } from "./use-balances";
import type { YieldGain, YieldGains } from "./yield-gains";

function asset(id: bigint, symbol: string, over: Partial<RegisteredAsset> = {}): RegisteredAsset {
  return {
    id,
    token: `0x${id.toString().padStart(40, "0")}` as RegisteredAsset["token"],
    isWeth: false,
    symbol,
    decimals: 18,
    scale: 1n,
    index: RAY,
    yieldEnabled: false,
    yieldHalted: false,
    ...over,
  };
}

const row = (id: bigint, balance: bigint): AssetBalanceView => ({
  asset: id,
  balance,
  notes: 1,
  pending: 0n,
  outflow: 0n,
});

const gain = (over: Partial<YieldGain> = {}): YieldGain => ({
  gain: 0n,
  basis: 10n ** 18n,
  resolvedNotes: 1,
  unknownNotes: 0,
  ...over,
});

function renderTable(assets: RegisteredAsset[], gains: YieldGains) {
  render(
    <MemoryRouter>
      <ShieldedTable
        rows={assets.map((a) => row(a.id, 10n ** 18n))}
        byId={new Map(assets.map((a) => [a.id, a]))}
        prices={new Map()}
        gains={gains}
      />
    </MemoryRouter>,
  );
  // Selected by the class the column carries, not by position: the responsive
  // rule and the header use the same selector, so inserting another column
  // breaks this loudly instead of silently retargeting every assertion.
  return (symbol: string) => {
    const row = screen.getByText(symbol).closest("tr") as HTMLElement;
    return row.querySelector(".tbl__earned") as HTMLElement;
  };
}

describe("ShieldedTable earned column", () => {
  it("is blank for plain custody", () => {
    const cell = renderTable([asset(1n, "USDC")], new Map())("USDC");
    expect(cell.textContent).toBe("");
  });

  it("shows a dash when the asset earns but no basis resolved", () => {
    const a = asset(2n, "WETH", { yieldEnabled: true });
    const cell = renderTable(
      [a],
      new Map([[2n, gain({ resolvedNotes: 0, unknownNotes: 3 })]]),
    )("WETH");

    // A dash on screen, and the reason for it in a hidden node beside it: the
    // explanation used to live only in `title`, which a plain span does not
    // expose and touch never surfaces at all.
    expect(cell.querySelector("[aria-hidden]")?.textContent).toBe("—");
    expect(cell.querySelector(".sr-only")?.textContent).toContain("no historical index");
  });

  it("shows the signed amount and its rate", () => {
    const a = asset(3n, "WETH", { yieldEnabled: true, index: (RAY * 110n) / 100n });
    const cell = renderTable([a], new Map([[3n, gain({ gain: 10n ** 17n })]]))("WETH");
    expect(cell.textContent).toContain("+0.1");
    expect(cell.textContent).toContain("10.00%");
  });

  it("marks a partial figure as a lower bound", () => {
    const a = asset(4n, "WETH", { yieldEnabled: true });
    const cell = renderTable(
      [a],
      new Map([[4n, gain({ gain: 10n ** 17n, unknownNotes: 2 })]]),
    )("WETH");
    expect(cell.textContent).toContain("≥");
  });

  it("renders a venue loss as a negative rather than clamping it", () => {
    const a = asset(5n, "WETH", { yieldEnabled: true });
    const cell = renderTable([a], new Map([[5n, gain({ gain: -(10n ** 17n) })]]))("WETH");
    expect(cell.textContent).toContain("−0.1");
    expect(cell.textContent).toContain("-10.00%");
  });
});

// The legend under the table. It is a key for glyphs the column actually
// printed, so each line has to be gated on its own marker: naming `≥` while
// every affected row shows a dash points at a symbol that is not there.
describe("ShieldedTable earned legend", () => {
  const legend = () => document.querySelector(".tbl__legend");

  it("says nothing when no row earns", () => {
    renderTable([asset(1n, "USDC")], new Map());
    expect(legend()).toBeNull();
  });

  it("keys the dash, not `≥`, when nothing resolved", () => {
    renderTable(
      [asset(2n, "WETH", { yieldEnabled: true })],
      new Map([[2n, gain({ resolvedNotes: 0, unknownNotes: 3 })]]),
    );
    const text = legend()?.textContent ?? "";
    expect(text).toContain("no historical index");
    expect(text).not.toContain("≥");
  });

  it("keys `≥` when a figure understates", () => {
    renderTable(
      [asset(4n, "WETH", { yieldEnabled: true })],
      new Map([[4n, gain({ gain: 10n ** 17n, unknownNotes: 2 })]]),
    );
    expect(legend()?.textContent).toContain("≥");
  });

  // The containment is the head's job, not the legend's: the head is on screen
  // for every row and every reader, and a prose line repeating it under the
  // table is one more thing to scroll to and miss.
  it("leaves containment to the column head, which states it in words", () => {
    renderTable(
      [asset(3n, "WETH", { yieldEnabled: true })],
      new Map([[3n, gain({ gain: 10n ** 17n })]]),
    );
    expect(legend()).toBeNull();
    const head = document.querySelector("th.tbl__earned") as HTMLElement;
    expect(head.textContent).toContain("of which earned");
    // The arrow is punctuation pointing at the balance column; a screen reader
    // reading it out would say "downwards arrow with tip rightwards" mid-phrase.
    expect(head.querySelector(".tbl__tie")?.getAttribute("aria-hidden")).toBe("true");
  });

  // A fence drawn round the pair, so the relation the head states is visible
  // from any row without reading the head again.
  it("fences the balance and earned cells together", () => {
    renderTable(
      [asset(3n, "WETH", { yieldEnabled: true })],
      new Map([[3n, gain({ gain: 10n ** 17n })]]),
    );
    const row = screen.getByText("WETH").closest("tr") as HTMLElement;
    expect(row.querySelector("td.tbl__grp-a .bal")).not.toBeNull();
    expect(row.querySelector("td.tbl__grp-b.tbl__earned")).not.toBeNull();
  });

  // The table box scrolls at its max height; a legend inside it is unreachable
  // until the reader has scrolled past the rows it explains.
  it("sits outside the scrolling table box", () => {
    renderTable(
      [asset(4n, "WETH", { yieldEnabled: true })],
      new Map([[4n, gain({ gain: 10n ** 17n, unknownNotes: 2 })]]),
    );
    const el = legend();
    expect(el).not.toBeNull();
    expect(el?.closest(".tbl-wrap")).toBeNull();
  });
});

// The venue rate on the `earning` badge. What it is *not* matters as much as
// what it is: a rate the venue paid, not a return this wallet made, and absent
// rather than zero when nothing could be measured.
describe("ShieldedTable venue rate", () => {
  const badge = () => document.querySelector(".tok__yield") as HTMLElement;

  /// The legend row whose key reads `key`, or `undefined` if there is none.
  const keyed = (key: string) =>
    [...document.querySelectorAll(".tbl__legend-row")].find(
      (r) => r.querySelector("dt")?.textContent === key,
    );

  it("replaces the word with the labelled rate", () => {
    const a = asset(6n, "WETH", { yieldEnabled: true, apy: { rate: 0.0418, windowDays: 7 } });
    renderTable([a], new Map());
    // Labelled, not bare: `apy` is what says the figure is the venue's rate
    // rather than this wallet's return, and it is the only thing on the badge
    // that says so.
    expect(badge().textContent).toBe("4.18%apy");
  });

  it("says only `earning` when no rate could be measured", () => {
    const a = asset(7n, "WETH", { yieldEnabled: true });
    renderTable([a], new Map());
    expect(badge().textContent).toBe("earning");
    expect(badge().querySelector(".tok__apy")).toBeNull();
  });

  // A halted venue is not earning at whatever it last paid; the rate would be
  // the most recent thing on the row and the only untrue one.
  it("drops the rate when the venue is paused", () => {
    const a = asset(8n, "WETH", {
      yieldEnabled: true,
      yieldHalted: true,
      apy: { rate: 0.0418, windowDays: 7 },
    });
    renderTable([a], new Map());
    expect(badge().textContent).toBe("paused");
  });

  it("keys the rate on the badge's own label, not on `%`", () => {
    const a = asset(9n, "WETH", { yieldEnabled: true, apy: { rate: 0.0418, windowDays: 7 } });
    renderTable([a], new Map());
    const legend = document.querySelector(".tbl__legend") as HTMLElement;
    // `%` would key both percentages on the card, including the one this row
    // exists to distinguish itself from.
    expect(keyed("%")).toBeUndefined();
    expect(keyed("apy")).toBeDefined();
    expect(legend.textContent).toContain("the venue's own rate");
    // The window is the measured one, read off the asset — not a constant the
    // client picked, which would misstate a shorter measurement as a week.
    expect(legend.textContent).toContain("annualized from the last 7 days");
  });

  // The distinction is shown as a pair of keys rather than asserted in a
  // sentence: one above the other, a reader compares them instead of holding
  // "A, not B" in their head.
  it("pairs the rate key with the earned key when both are on screen", () => {
    const a = asset(10n, "WETH", { yieldEnabled: true, apy: { rate: 0.0418, windowDays: 7 } });
    renderTable([a], new Map([[10n, gain({ gain: 10n ** 17n })]]));
    expect(keyed("apy")?.textContent).toContain("the venue's own rate");
    expect(keyed("earned")?.textContent).toContain("yours");
  });

  // With every row's basis unresolved the column shows dashes, so there is no
  // earned figure for the key to contrast the rate with.
  it("drops the earned key when the column has no figure to contrast", () => {
    const a = asset(11n, "WETH", { yieldEnabled: true, apy: { rate: 0.0418, windowDays: 7 } });
    renderTable([a], new Map([[11n, gain({ resolvedNotes: 0, unknownNotes: 2 })]]));
    expect(keyed("apy")).toBeDefined();
    expect(keyed("earned")).toBeUndefined();
  });

  // The `earned` column goes at 480px and its keys go with it; this one does
  // not, because the badge it explains is in the asset cell.
  it("keeps the rate key off the column-scoped class", () => {
    const a = asset(9n, "WETH", { yieldEnabled: true, apy: { rate: 0.0418, windowDays: 7 } });
    renderTable([a], new Map());
    // The rate's badge is in the asset cell, which phones keep.
    expect(keyed("apy")?.classList.contains("tbl__legend-row--earned")).toBe(false);
    // The keys that do belong to the column carry it, or the rule that drops
    // them on a phone would drop nothing.
    expect(keyed("—")?.classList.contains("tbl__legend-row--earned")).toBe(true);
  });
});
