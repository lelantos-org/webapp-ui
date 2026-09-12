// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimLinksSnapshot, rememberClaimLink } from "@/features/claim-links";
import { ClaimLinkResult, maskClaimUrl } from "./ClaimLinkResult";

const URL_ = "https://lelantos.xyz/claim#7a69:deadbeefdeadbeef";
const WEEK = 7 * 24 * 60 * 60 * 1000;

beforeEach(() => {
  localStorage.clear();
});

describe("ClaimLinkResult", () => {
  it("promises the vault's window, never 'until it's claimed'", () => {
    render(
      <ClaimLinkResult
        url={URL_}
        amountLabel="75 USDC"
        recordId="x"
        ttlMs={WEEK}
        onReset={() => {}}
      />,
    );
    expect(
      screen.getByText(
        "Works once. We keep a copy in this browser for 7 days or until you delete it.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/until it's claimed/)).toBeNull();
  });

  it("marks the record shared once the link is copied", async () => {
    const id = rememberClaimLink({ url: URL_, chainId: 31337n, assetId: 1n, amount: 1n });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <ClaimLinkResult
        url={URL_}
        amountLabel="75 USDC"
        recordId={id}
        ttlMs={WEEK}
        onReset={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await screen.findByRole("button", { name: "Copied" });
    expect(claimLinksSnapshot()[0]?.copiedAt).toBeTypeOf("number");
    expect(writeText).toHaveBeenCalledWith(URL_);
  });

  it("shows the secret only when asked", () => {
    render(
      <ClaimLinkResult
        url={URL_}
        amountLabel="75 USDC"
        recordId="x"
        ttlMs={WEEK}
        onReset={() => {}}
      />,
    );
    expect(screen.queryByText(URL_)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByText(URL_)).toBeTruthy();
  });
});

describe("maskClaimUrl", () => {
  it("keeps the host and path, and hides the secret", () => {
    const url = "https://lelantos.xyz/claim#7a69:deadbeefdeadbeef";
    expect(maskClaimUrl(url)).toBe(`lelantos.xyz/claim#${"•".repeat(16)}`);
    expect(maskClaimUrl(url)).not.toContain("deadbeef");
  });

  it("masks a short secret to the same width, so the length does not leak", () => {
    expect(maskClaimUrl("http://localhost:5174/claim#ab")).toBe(
      `localhost:5174/claim#${"•".repeat(16)}`,
    );
  });
});
