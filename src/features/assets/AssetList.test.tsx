// @vitest-environment jsdom
// The asset list and its row detail. The arithmetic and wording rules are in
// `asset-copy.test.ts`; what matters here is where each figure lands — the
// venue's rate only in the detail, the wallet's return in dollars on the list —
// and that the detail behaves as one disclosure at a time.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { RegisteredAsset } from "@/config/chains";
import { stubReducedMotion } from "@/test/dom";
import { makeAsset } from "@/test/fixtures/assets";
import { yieldGain as gain, priceMap as prices } from "@/test/fixtures/prices";
import { AssetList } from "./AssetList";
import type { PriceMap } from "./prices";
import type { AssetBalanceView } from "./use-balances";
import type { YieldGains } from "./yield-gains";

const row = (id: bigint, balance: bigint): AssetBalanceView => ({
  asset: id,
  balance,
  notes: 1,
  pending: 0n,
  outflow: 0n,
});

function renderList(assets: RegisteredAsset[], gains: YieldGains, priceMap: PriceMap = new Map()) {
  render(
    <AssetList
      rows={assets.map((a) => row(a.id, 10n ** 18n))}
      byId={new Map(assets.map((a) => [a.id, a]))}
      prices={priceMap}
      gains={gains}
    />,
  );
}

const rowButton = (symbol: string) =>
  screen
    .getAllByRole("button")
    .find((b) => b.querySelector(".pf-row__name")?.textContent === symbol) as HTMLElement;

describe("AssetList", () => {
  beforeEach(() => {
    // Collapse without waiting out the transition.
    stubReducedMotion();
  });

  it("puts the value and the dollar earnings on the row, and no rate", () => {
    const weth = makeAsset(1n, "WETH", {
      yieldEnabled: true,
      apy: { rate: 0.0418, windowDays: 7 },
    });
    renderList([weth], new Map([[1n, gain({ gain: 10n ** 16n })]]), prices({ [weth.token]: 2000 }));

    const btn = rowButton("WETH");
    expect(within(btn).getByText("$2,000.00")).toBeInTheDocument();
    expect(within(btn).getByText("+$20.00 earned")).toBeInTheDocument();
    expect(btn.textContent).not.toContain("4.18%");
  });

  // A plain asset and its earning twin share a symbol; the vault tells them apart.
  it("names the vault beside an earning asset's symbol in the row", () => {
    const plain = makeAsset(1n, "USDC", { decimals: 6 });
    const earning = makeAsset(2n, "USDC", {
      decimals: 6,
      yieldEnabled: true,
      vaultName: "Steakhouse USDC",
    });
    renderList([plain, earning], new Map());

    expect(rowButton("USDC")).toBeDefined();
    expect(rowButton("USDC · Steakhouse USDC")).toBeDefined();
  });

  // The row above the detail already carries them; saying them twice reads as a
  // second row rather than as the row's detail.
  it("does not repeat the asset's name or balance in the open detail", async () => {
    const earning = makeAsset(2n, "USDC", {
      decimals: 6,
      yieldEnabled: true,
      vaultName: "Steakhouse USDC",
      apy: { rate: 0.0418, windowDays: 9 },
    });
    renderList([earning], new Map());

    const btn = rowButton("USDC · Steakhouse USDC");
    await userEvent.click(btn);
    const detail = document.getElementById(btn.getAttribute("aria-controls") ?? "") as HTMLElement;
    expect(detail).toHaveTextContent("Pool pays");
    expect(detail.textContent).not.toContain("Steakhouse USDC");
  });

  it("dashes an unpriced value rather than printing $0.00", () => {
    renderList([makeAsset(2n, "ABC")], new Map());
    expect(rowButton("ABC").textContent).toContain("—");
    expect(rowButton("ABC").textContent).not.toContain("$0.00");
  });

  it("opens the detail with the venue's rate and its measured window", async () => {
    const weth = makeAsset(1n, "WETH", {
      yieldEnabled: true,
      apy: { rate: 0.0418, windowDays: 9 },
    });
    renderList([weth], new Map([[1n, gain({ gain: 10n ** 17n })]]));

    const btn = rowButton("WETH");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");

    const detail = document.getElementById(btn.getAttribute("aria-controls") ?? "") as HTMLElement;
    expect(detail).toHaveTextContent("4.18% / yr");
    expect(detail).toHaveTextContent("measured over 9d");
    // Token units and growth, not dollars, in the detail.
    expect(detail).toHaveTextContent("+0.1");
    expect(detail).toHaveTextContent("+10.00%");
  });

  it("keeps one detail open at a time", async () => {
    renderList([makeAsset(1n, "AAA"), makeAsset(2n, "BBB")], new Map());

    await userEvent.click(rowButton("AAA"));
    await userEvent.click(rowButton("BBB"));

    expect(rowButton("AAA")).toHaveAttribute("aria-expanded", "false");
    expect(rowButton("BBB")).toHaveAttribute("aria-expanded", "true");
  });

  it("says plainly that a custody asset does not earn", async () => {
    renderList([makeAsset(3n, "USDT")], new Map());
    await userEvent.click(rowButton("USDT"));
    expect(screen.getByText(/USDT does not earn/)).toBeInTheDocument();
  });

  it("dashes an unresolved basis in the detail instead of reporting +0", async () => {
    const weth = makeAsset(5n, "WETH", { yieldEnabled: true });
    renderList([weth], new Map([[5n, gain({ resolvedNotes: 0, unknownNotes: 2 })]]));

    expect(rowButton("WETH").textContent).not.toContain("earned");
    await userEvent.click(rowButton("WETH"));
    expect(screen.getByText(/No recorded history reaches back/)).toBeInTheDocument();
    expect(screen.getByText("not measurable yet")).toBeInTheDocument();
  });
});
