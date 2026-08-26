import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChainIcon } from "./ChainIcon";
import { TokenIcon } from "./TokenIcon";

/// The marks are `aria-hidden`, so no accessible query reaches them; that is
/// itself part of the behaviour under test. See the decorative case.
function mark(container: HTMLElement, selector: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`no ${selector} rendered`);
  return el;
}

describe("TokenIcon", () => {
  it("never requests a remote image", () => {
    // The whole reason the artwork is inlined: the CSP is `img-src 'self'
    // data:`, and asking a logo CDN for a token would tell it which assets this
    // user holds. Neither branch may become a network fetch.
    for (const symbol of ["USDC", "ZZZZ"]) {
      const { container } = render(<TokenIcon symbol={symbol} address="0xa0b8" />);
      expect(container.querySelector("img")).toBeNull();
      expect(container.innerHTML).not.toMatch(/https?:\/\//);
    }
  });

  it("draws the real mark for a token the bundle knows", () => {
    const { container } = render(<TokenIcon symbol="USDC" address="0xa0b8" />);
    const el = mark(container, ".tok__mark");

    expect(el.querySelector("svg")).not.toBeNull();
    // The tinted box is dropped, or the logo sits in a badge on a badge.
    expect(el.className).toContain("tok__mark--art");
    expect(el.textContent).toBe("");
  });

  it("matches the symbol case-insensitively", () => {
    // `symbol()` is whatever the token returns; the table is keyed uppercase.
    const { container } = render(<TokenIcon symbol="usdc" />);
    expect(mark(container, ".tok__mark").querySelector("svg")).not.toBeNull();
  });

  it("gives WETH ether's mark", () => {
    // It is ether. `chains.ts` derives `isWeth` from this same symbol.
    const { container: weth } = render(<TokenIcon symbol="WETH" />);
    const { container: eth } = render(<TokenIcon symbol="ETH" />);

    expect(mark(weth, ".tok__mark").innerHTML).toBe(mark(eth, ".tok__mark").innerHTML);
  });

  it("falls back to a coloured monogram for a token it does not know", () => {
    const { container } = render(<TokenIcon symbol="ZZZZ" address="0xaaaa" />);
    const el = mark(container, ".tok__mark");

    expect(el.querySelector("svg")).toBeNull();
    expect(el.className).not.toContain("tok__mark--art");
    expect(el.textContent).toBe("ZZ");
    expect(el.style.getPropertyValue("--mono-h")).not.toBe("");
  });

  it("separates two unknown same-symbol tokens by address", () => {
    // Nothing stops two chains registering different assets under one symbol,
    // and a symbol-only seed would draw them identically.
    const { container: a } = render(<TokenIcon symbol="ZZZZ" address="0xaaaa" />);
    const { container: b } = render(<TokenIcon symbol="ZZZZ" address="0xbbbb" />);

    expect(mark(a, ".tok__mark").style.getPropertyValue("--mono-h")).not.toBe(
      mark(b, ".tok__mark").style.getPropertyValue("--mono-h"),
    );
  });

  it("still renders for an asset whose symbol the indexer has not resolved", () => {
    const { container } = render(<TokenIcon symbol="#12" address="0xaaaa" />);
    expect(mark(container, ".tok__mark").textContent).toBe("12");
  });

  it("takes the claim page's larger box on request", () => {
    const { container } = render(<TokenIcon symbol="USDC" size="lg" />);
    expect(mark(container, ".tok__mark").className).toContain("tok__mark--lg");
  });

  it("is decorative, because every call site prints the symbol beside it", () => {
    // Announcing the mark would make a screen reader read each asset twice.
    for (const symbol of ["USDC", "ZZZZ"]) {
      const { container } = render(<TokenIcon symbol={symbol} />);
      expect(mark(container, ".tok__mark")).toHaveAttribute("aria-hidden");
    }
  });
});

describe("ChainIcon", () => {
  /// The six `prices::llama_chain` can price, which is the set the relayer is
  /// deployed against. Asserted as a table so adding a chain to the registry
  /// without artwork fails here rather than in a browser.
  const SERVED = [1n, 10n, 137n, 8453n, 42161n, 43114n];

  it("draws a real mark for every chain the deployment serves", () => {
    for (const chainId of SERVED) {
      const { container } = render(<ChainIcon chainId={chainId} chainName="x" />);
      const el = mark(container, ".chain-icon");

      expect(el.querySelector("svg"), `chain ${chainId}`).not.toBeNull();
      expect(el.className).toContain("chain-icon--art");
    }
  });

  it("draws a different mark for each of them", () => {
    const drawn = SERVED.map((chainId) => {
      const { container } = render(<ChainIcon chainId={chainId} chainName="x" />);
      return mark(container, ".chain-icon").innerHTML;
    });

    expect(new Set(drawn).size).toBe(SERVED.length);
  });

  it("falls back to the name for a chain this bundle predates", () => {
    // Anvil, and any network onboarded after this build. It must render as
    // itself rather than vanish or borrow another chain's mark.
    const { container } = render(<ChainIcon chainId={31337n} chainName="anvil" />);
    const el = mark(container, ".chain-icon");

    expect(el.querySelector("svg")).toBeNull();
    expect(el.textContent).toBe("AN");
    expect(el.style.getPropertyValue("--mono-h")).not.toBe("");
  });

  it("seeds the fallback on the id, not the operator-supplied name", () => {
    // `chains.public.name` is a config string that can be reworded without the
    // network having become a different one.
    const { container: a } = render(<ChainIcon chainId={31337n} chainName="anvil" />);
    const { container: b } = render(<ChainIcon chainId={31337n} chainName="local dev" />);

    expect(mark(a, ".chain-icon").style.getPropertyValue("--mono-h")).toBe(
      mark(b, ".chain-icon").style.getPropertyValue("--mono-h"),
    );
  });
});
