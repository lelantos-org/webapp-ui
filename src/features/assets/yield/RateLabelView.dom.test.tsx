import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeAsset } from "@/test/fixtures/assets";
import { RateLabelView } from "./RateLabelView";

const earning = makeAsset(1n, "WETH", {
  yieldEnabled: true,
  apy: { rate: 0.0418, windowDays: 7 },
});
const paused = makeAsset(2n, "WETH", { yieldEnabled: true, yieldHalted: true });
const unmeasured = makeAsset(3n, "WETH", { yieldEnabled: true });
const plain = makeAsset(4n, "USDC", { decimals: 6 });

const text = (asset: typeof earning, variant: "detail" | "compact" | "picker") =>
  render(<RateLabelView asset={asset} variant={variant} />).container.textContent;

describe("RateLabelView", () => {
  it("states a rate in each surface's length", () => {
    expect(text(earning, "detail")).toBe("4.18% / yrmeasured over 7d");
    expect(text(earning, "compact")).toBe("4.18% / yr · 7d");
    expect(text(earning, "picker")).toBe("4.18% / yrmeasured over 7d");
  });

  it("says a paused venue is still backed", () => {
    expect(text(paused, "detail")).toBe("pausedstill fully backed");
    expect(text(paused, "compact")).toBe("paused · still backed");
    expect(text(paused, "picker")).toBe("pausedstill fully backed");
  });

  it("never lets an unmeasurable rate read as nothing earned", () => {
    expect(text(unmeasured, "detail")).toBe("—not measurable yet");
    expect(text(unmeasured, "picker")).toBe("—rate cannot be measured");
    const { container } = render(<RateLabelView asset={unmeasured} variant="compact" />);
    expect(container.firstElementChild).toHaveAttribute("title", "Rate not measurable yet");
  });

  it("says plain custody does not earn", () => {
    expect(text(plain, "compact")).toBe("does not earn");
    expect(text(plain, "picker")).toBe("does not earn");
  });
});
