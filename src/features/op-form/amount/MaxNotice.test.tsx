// @vitest-environment jsdom
import type { SpendableMax } from "@lelantos-org/sdk";
import { RAY } from "@lelantos-org/sdk/protocol";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MaxNotice } from "./MaxNotice";

const META = { symbol: "WETH", decimals: 0, scale: 1n, index: RAY };

const spendable = (slots: bigint): SpendableMax =>
  ({
    max: 100n,
    withheld: { reserved: 0n, cooldown: 0n, dust: 0n, slots },
  }) as SpendableMax;

const TEXT = /the most you can move at once/;

describe("MaxNotice", () => {
  it("renders nothing when the slot cap holds nothing back", () => {
    const { container } = render(
      <MaxNotice spendable={spendable(0n)} meta={META} verb="Sending" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // The note used to be a box under the amount on every capped spend. It is
  // closed until asked for, so it takes no room in the form.
  it("keeps the explanation behind a button until opened", async () => {
    const user = userEvent.setup();
    render(<MaxNotice spendable={spendable(5n)} meta={META} verb="Sending" />);

    const btn = screen.getByRole("button", { name: /why is max lower/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();

    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(TEXT)).toBeInTheDocument();
    expect(screen.getByText(/Sending raises this limit/)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
    expect(btn).toHaveFocus();
  });
});
