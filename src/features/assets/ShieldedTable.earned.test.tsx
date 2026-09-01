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
