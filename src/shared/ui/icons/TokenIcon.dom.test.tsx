import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChainIcon } from "./ChainIcon";
import { TokenIcon } from "./TokenIcon";

function mark(container: HTMLElement, selector: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`no ${selector} rendered`);
  return el;
}

describe("TokenIcon", () => {
  it("never requests a remote image", () => {
    // A logo CDN fetch would leak which assets the user holds.
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
    expect(el.textContent).toBe("");
  });

  it("matches the symbol case-insensitively", () => {
    const { container } = render(<TokenIcon symbol="usdc" />);
    expect(mark(container, ".tok__mark").querySelector("svg")).not.toBeNull();
  });

  it("gives WETH ether's mark", () => {
    const { container: weth } = render(<TokenIcon symbol="WETH" />);
    const { container: eth } = render(<TokenIcon symbol="ETH" />);

    expect(mark(weth, ".tok__mark").innerHTML).toBe(mark(eth, ".tok__mark").innerHTML);
  });

  it("falls back to a coloured monogram for a token it does not know", () => {
    const { container } = render(<TokenIcon symbol="ZZZZ" address="0xaaaa" />);
    const el = mark(container, ".tok__mark");

    expect(el.querySelector("svg")).toBeNull();
    expect(el.textContent).toBe("ZZ");
    expect(el.style.getPropertyValue("--mono-h")).not.toBe("");
  });

  it("separates two unknown same-symbol tokens by address", () => {
    const { container: a } = render(<TokenIcon symbol="ZZZZ" address="0xaaaa" />);
    const { container: b } = render(<TokenIcon symbol="ZZZZ" address="0xbbbb" />);

    expect(mark(a, ".tok__mark").style.getPropertyValue("--mono-h")).not.toBe(
      mark(b, ".tok__mark").style.getPropertyValue("--mono-h"),
    );
  });

  it("is decorative, because every call site prints the symbol beside it", () => {
    for (const symbol of ["USDC", "ZZZZ"]) {
      const { container } = render(<TokenIcon symbol={symbol} />);
      expect(mark(container, ".tok__mark")).toHaveAttribute("aria-hidden");
    }
  });
});

describe("ChainIcon", () => {
  const SERVED = [1n, 10n, 137n, 8453n, 42161n, 43114n];

  it("draws a real mark for every chain the deployment serves", () => {
    for (const chainId of SERVED) {
      const { container } = render(<ChainIcon chainId={chainId} chainName="x" />);
      const el = mark(container, ".chain-icon");

      expect(el.querySelector("svg"), `chain ${chainId}`).not.toBeNull();
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
    const { container } = render(<ChainIcon chainId={31337n} chainName="anvil" />);
    const el = mark(container, ".chain-icon");

    expect(el.querySelector("svg")).toBeNull();
    expect(el.textContent).toBe("AN");
    expect(el.style.getPropertyValue("--mono-h")).not.toBe("");
  });

  it("seeds the fallback on the id, not the operator-supplied name", () => {
    const { container: a } = render(<ChainIcon chainId={31337n} chainName="anvil" />);
    const { container: b } = render(<ChainIcon chainId={31337n} chainName="local dev" />);

    expect(mark(a, ".chain-icon").style.getPropertyValue("--mono-h")).toBe(
      mark(b, ".chain-icon").style.getPropertyValue("--mono-h"),
    );
  });
});
