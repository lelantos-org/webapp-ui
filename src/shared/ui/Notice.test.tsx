// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Notice } from "@/shared/ui/Notice";

describe("Notice", () => {
  it("keeps the old call shape: a warn box with a trailing action", () => {
    const onAction = vi.fn();
    render(
      <Notice title="Can't read the network fee" actionLabel="Retry" onAction={onAction}>
        The deposit can't be checked against your balance until it loads.
      </Notice>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Can't read the network fee");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("tones the action with the box", () => {
    render(
      <Notice tone="accent" title="Set up" actionLabel="Set up" onAction={() => {}}>
        body
      </Notice>,
    );
    expect(screen.getByRole("button", { name: "Set up" })).toHaveClass("btn--outline-accent");
  });

  it("takes a body-only sentence and an action below it", () => {
    render(
      <Notice tone="warn" actionPlacement="below" action={<a href="#fee">Pay the fee in ETH</a>}>
        Not enough USDC to pay the relayer.
      </Notice>,
    );
    expect(
      within(screen.getByRole("status")).getByRole("link", { name: "Pay the fee in ETH" }),
    ).toBeInTheDocument();
  });

  it("draws a glyph per tone unless told not to", () => {
    const { container, rerender } = render(<Notice tone="neutral">Max is 3,180.00</Notice>);
    expect(container.querySelector(".notice__icon svg")).not.toBeNull();
    rerender(
      <Notice tone="neutral" icon={false}>
        Max is 3,180.00
      </Notice>,
    );
    expect(container.querySelector(".notice__icon")).toBeNull();
  });

  it("can sit in the page without announcing itself", () => {
    render(
      <Notice tone="err" announce={false}>
        This browser keeps 50 links.
      </Notice>,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
