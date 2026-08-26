import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "@/shared/ui/Modal";

describe("Modal", () => {
  it("dismisses on Escape and on a backdrop click", async () => {
    const onDismiss = vi.fn();
    render(
      <Modal title="Confirm" onDismiss={onDismiss}>
        <p>body</p>
      </Modal>,
    );

    await userEvent.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalledTimes(1);

    const overlay = document.querySelector(".modal-overlay");
    if (!overlay) throw new Error("overlay not rendered");
    await userEvent.click(overlay);
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it("clicking inside the panel is not a dismiss", async () => {
    const onDismiss = vi.fn();
    render(
      <Modal title="Confirm" onDismiss={onDismiss}>
        <p>body</p>
      </Modal>,
    );

    await userEvent.click(screen.getByText("body"));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("closes every dismiss path while busy", async () => {
    // The flow is mid-wallet-prompt: neither Escape nor the backdrop may take
    // the modal away from under it.
    const onDismiss = vi.fn();
    render(
      <Modal title="Working" onDismiss={onDismiss} busy>
        <p>body</p>
      </Modal>,
    );

    await userEvent.keyboard("{Escape}");
    const overlay = document.querySelector(".modal-overlay");
    if (!overlay) throw new Error("overlay not rendered");
    await userEvent.click(overlay);

    expect(onDismiss).not.toHaveBeenCalled();
    expect(overlay).toHaveClass("modal-overlay--locked");
  });

  it("refuses a second dismiss while the exit is playing", async () => {
    const onDismiss = vi.fn();
    render(
      <Modal title="Leaving" onDismiss={onDismiss} exiting>
        <p>body</p>
      </Modal>,
    );

    await userEvent.keyboard("{Escape}");

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("focuses the nominated primary action", () => {
    render(
      <Modal title="Confirm">
        <button type="button">cancel</button>
        <button type="button" data-primary>
          go
        </button>
      </Modal>,
    );

    expect(screen.getByRole("button", { name: "go" })).toHaveFocus();
  });

  it("falls back to the first focusable when the primary is disabled", () => {
    // The confirm screen gates its primary on a checkbox. Focusing a disabled
    // button leaves focus on `<body>`, from where `trapFocus` — which keys off
    // the active element being inside the panel — traps nothing.
    render(
      <Modal title="Confirm">
        <input type="checkbox" aria-label="agree" />
        <button type="button" data-primary disabled>
          go
        </button>
      </Modal>,
    );

    expect(screen.getByRole("checkbox", { name: "agree" })).toHaveFocus();
  });

  it("re-focuses when the screen behind it changes", () => {
    const Panel = ({ step }: { step: string }) => (
      <Modal title="Setup" focusKey={step}>
        <button type="button" data-primary>
          {step}
        </button>
      </Modal>
    );
    const { rerender } = render(<Panel step="begin" />);
    expect(screen.getByRole("button", { name: "begin" })).toHaveFocus();

    // The element holding focus is unmounted by the swap; without the re-run,
    // focus falls back to `<body>` and Tab leaves the dialog.
    rerender(<Panel step="retry" />);

    expect(screen.getByRole("button", { name: "retry" })).toHaveFocus();
  });

  it("wraps Tab at the end of the panel", async () => {
    render(
      <Modal title="Confirm">
        <button type="button">first</button>
        <button type="button">last</button>
      </Modal>,
    );
    const first = screen.getByRole("button", { name: "first" });
    const last = screen.getByRole("button", { name: "last" });
    expect(first).toHaveFocus();

    await userEvent.tab();
    expect(last).toHaveFocus();
    await userEvent.tab();
    expect(first).toHaveFocus();
  });

  it("labels the dialog by its title and by the caller's description", () => {
    render(
      <Modal title="One-time setup" describedBy="desc">
        <p id="desc">what this does</p>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("One-time setup");
    expect(dialog).toHaveAccessibleDescription("what this does");
  });
});
