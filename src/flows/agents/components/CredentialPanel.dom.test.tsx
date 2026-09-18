// The panel shows a masked credential and copies an unmasked one. That gap is
// the whole point, so it is what these assert.

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StoredAgent } from "@/features/agents";
import { press } from "@/test/interact";
import { CredentialPanel } from "./CredentialPanel";

const copyWithToast = vi.fn();
const markAgentCopied = vi.fn();

vi.mock("@/shared/hooks/use-copy", () => ({
  copyWithToast: (text: string, msg: string) => copyWithToast(text, msg),
}));
vi.mock("@/features/agents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/agents")>()),
  markAgentCopied: (id: string) => markAgentCopied(id),
}));

const NSK = "0xdeadbeef";
const AGENT: StoredAgent = {
  id: "a1",
  label: "research bot",
  chainId: "31337",
  address: "lelantos1example",
  nsk: NSK,
  createdAt: 0,
};

function setup() {
  copyWithToast.mockClear();
  markAgentCopied.mockClear();
  return render(<CredentialPanel agent={AGENT} />);
}

describe("CredentialPanel", () => {
  it("does not put the key on screen by default", () => {
    const { container } = setup();
    expect(container.textContent).not.toContain(NSK);
  });

  it("still shows the address, which is not secret", () => {
    const { container } = setup();
    expect(container.textContent).toContain("lelantos1example");
  });

  it("copies the real key even while the screen shows a mask", () => {
    const { container } = setup();
    press("Copy credential");

    expect(container.textContent).not.toContain(NSK);
    expect(copyWithToast.mock.calls[0]?.[0]).toContain(NSK);
  });

  it("records that the credential left the browser", () => {
    setup();
    press("Copy credential");
    expect(markAgentCopied).toHaveBeenCalledWith("a1");
  });

  it("reveals the key on request, and hides it again", () => {
    const { container } = setup();

    press("Reveal key");
    expect(container.textContent).toContain(NSK);

    press("Hide key");
    expect(container.textContent).not.toContain(NSK);
  });

  it("reports its reveal state to assistive technology", () => {
    setup();
    const toggle = screen.getByRole("button", { name: "Reveal key" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    press(toggle);
    expect(screen.getByRole("button", { name: "Hide key" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("copies the .env form when that tab is chosen", () => {
    setup();
    press(screen.getByRole("tab", { name: ".env" }));
    press("Copy credential");
    expect(copyWithToast.mock.calls[0]?.[0]).toContain(`LELANTOS_NSK=${NSK}`);
  });

  it("keeps the key masked after switching tabs", () => {
    const { container } = setup();
    press(screen.getByRole("tab", { name: ".env" }));
    expect(container.textContent).not.toContain(NSK);
  });
});
