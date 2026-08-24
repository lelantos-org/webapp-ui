import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChainIcon } from "@/features/icons/ChainIcon";
import { TokenIcon } from "@/features/icons/TokenIcon";

/// The marks are `aria-hidden`, so no accessible query can reach them. That is
/// the behaviour under test as much as anything else — see the last case.
function mark(container: HTMLElement, selector: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`no ${selector} rendered`);
  return el;
}

describe("TokenIcon", () => {
  it("never requests a remote image", () => {
    // The whole reason the artwork is bundled: the CSP is `img-src 'self'
    // data:`, and asking a logo CDN for a token would tell it which assets
    // this user holds. Nothing here may become a network fetch.
    const { container } = render(<TokenIcon symbol="USDC" address="0xa0b8" />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toMatch(/https?:/);
  });

  it("shows two letters of the symbol", () => {
    const { container } = render(<TokenIcon symbol="usdc" />);
    expect(mark(container, ".tok__mark").textContent).toBe("US");
  });

  it("gives a recognised token its brand colour", () => {
    const { container } = render(<TokenIcon symbol="USDC" address="0xa0b8" />);
    const branded = mark(container, ".tok__mark").style.getPropertyValue("--mono-h");

    const { container: other } = render(<TokenIcon symbol="ZZZZ" address="0xa0b8" />);
    const derived = mark(other, ".tok__mark").style.getPropertyValue("--mono-h");

    expect(branded).not.toBe("");
    expect(branded).not.toBe(derived);
  });

  it("separates two same-symbol tokens by address", () => {
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
    const { container } = render(<TokenIcon symbol="USDC" />);
    expect(mark(container, ".tok__mark")).toHaveAttribute("aria-hidden");
  });
});

describe("ChainIcon", () => {
  it("gives a known chain its brand colour and short label", () => {
    const { container } = render(<ChainIcon chainId={1n} chainName="Ethereum" />);
    const el = mark(container, ".chain-icon");

    expect(el.textContent).toBe("ET");
    expect(el.style.getPropertyValue("--mono-h")).toBe("229");
  });

  it("falls back to the name for a chain this bundle predates", () => {
    // Anvil, and any network onboarded after this build. It must render as
    // itself rather than vanish or claim another chain's colour.
    const { container } = render(<ChainIcon chainId={31337n} chainName="anvil" />);
    const el = mark(container, ".chain-icon");

    expect(el.textContent).toBe("AN");
    expect(el.style.getPropertyValue("--mono-h")).not.toBe("");
  });

  it("seeds on the id, not the operator-supplied name", () => {
    // `chains.public.name` is a config string that can be reworded without the
    // network having become a different one.
    const { container: a } = render(<ChainIcon chainId={31337n} chainName="anvil" />);
    const { container: b } = render(<ChainIcon chainId={31337n} chainName="local dev" />);

    expect(mark(a, ".chain-icon").style.getPropertyValue("--mono-h")).toBe(
      mark(b, ".chain-icon").style.getPropertyValue("--mono-h"),
    );
  });
});
