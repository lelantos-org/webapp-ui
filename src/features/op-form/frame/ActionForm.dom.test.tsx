import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Step, TxPhase } from "@/features/tx";
import { press } from "@/test/interact";
import { routerWrapper } from "@/test/render";
import { ActionForm, type ActionFormProps } from "./ActionForm";

vi.mock("@/features/chain", () => ({
  useTxExplorerUrl: () => (hash: string) => `https://explorer.test/tx/${hash}`,
}));

const STEPS: Step[] = [
  { id: "preparing", label: "Pick funds" },
  { id: "proving", label: "Generate proof" },
  { id: "submitting", label: "Submit" },
  { id: "mined", label: "Completed" },
];

const progress = (phase: TxPhase | undefined, done = false) => ({
  steps: STEPS,
  phase,
  done,
  failedAt: undefined,
  endedAs: undefined,
  provingSince: undefined,
  reset: () => {},
});

function renderForm(over: Partial<ActionFormProps> = {}) {
  const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
  const props: ActionFormProps = {
    submitLabel: "Review",
    busy: false,
    onSubmit,
    children: <input aria-label="amount" defaultValue="250" />,
    ...over,
  };
  const view = render(<ActionForm {...props} />, { wrapper: routerWrapper });
  return {
    ...view,
    onSubmit,
    rerenderWith: (next: Partial<ActionFormProps>) =>
      view.rerender(<ActionForm {...props} {...next} />),
  };
}

describe("ActionForm", () => {
  it("renders the header, fields, details and CTA", () => {
    renderForm({ header: <h1>Send privately</h1>, details: <div>Details row</div> });
    expect(screen.getByRole("heading", { name: "Send privately" })).toBeInTheDocument();
    expect(screen.getByLabelText("amount")).toBeVisible();
    expect(screen.getByText("Details row")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
  });

  it("puts the blocked reason under the CTA in place of the footnote, and links them", () => {
    const { rerenderWith } = renderForm({
      footnote: "The relayer is paid from your USDC balance.",
    });
    expect(screen.getByText(/relayer is paid/)).toBeInTheDocument();

    rerenderWith({
      footnote: "The relayer is paid from your USDC balance.",
      submitDisabled: true,
      blockedReason: "Enter a recipient address",
    });
    const cta = screen.getByRole("button", { name: "Review" });
    const why = screen.getByText("Enter a recipient address");
    expect(cta).toBeDisabled();
    expect(cta).toHaveAttribute("aria-describedby", why.id);
    expect(screen.queryByText(/relayer is paid/)).not.toBeInTheDocument();
  });

  it("hides the fields under a review without unmounting them", () => {
    renderForm({ review: <div>Summary</div> });
    const field = screen.getByLabelText("amount");
    expect(field).toBeInTheDocument();
    expect(field.closest("[hidden]")).not.toBeNull();
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review" })).not.toBeInTheDocument();
  });

  it("replaces the fields with the progress card while the op runs", () => {
    renderForm({
      busy: true,
      progress: progress("proving"),
      tx: { progressTitle: "Proving your transfer", amount: "250 USDC" },
    });
    expect(screen.getByText("Proving your transfer")).toBeInTheDocument();
    expect(screen.getByText("250 USDC")).toBeInTheDocument();
    expect(screen.getByText("Generate proof")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Step 2 of 4: Generate proof");
    expect(screen.getByLabelText("amount").closest("[hidden]")).not.toBeNull();
  });

  it("stays in flight after broadcast until the terminal step, keeping the amount", () => {
    const { rerenderWith } = renderForm({
      busy: true,
      progress: progress("proving"),
      tx: { settledTitle: "Sent privately", amount: "250 USDC" },
    });
    rerenderWith({
      busy: false,
      progress: progress("submitting"),
      txHash: "0xabc",
      tx: { settledTitle: "Sent privately", amount: undefined },
    });
    expect(screen.getByText("250 USDC")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back home" })).toBeInTheDocument();

    rerenderWith({
      busy: false,
      progress: progress("mined", true),
      txHash: "0x4c8e0000000000000000000000000000000091af",
      tx: { settledTitle: "Sent privately", amount: undefined },
    });
    expect(screen.getByText("Sent privately")).toBeInTheDocument();
    expect(screen.getByText("250 USDC")).toBeInTheDocument();
    expect(screen.getByText("0x4c8e…91af")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explorer ↗" })).toHaveAttribute(
      "href",
      "https://explorer.test/tx/0x4c8e0000000000000000000000000000000091af",
    );
  });

  it("names a bundled operation on the settled card, beside the tx link", () => {
    const cm = `0x${"ab".repeat(30)}cdef`;
    renderForm({
      progress: progress("mined", true),
      txHash: "0x4c8e0000000000000000000000000000000091af",
      operation: { index: 2, count: 3, commitment: cm },
    });
    expect(screen.getByText("Operation 2 of 3")).toBeInTheDocument();
    expect(screen.getByTitle(cm)).toHaveTextContent("0xabab…cdef");
    expect(screen.getByRole("link", { name: "Explorer ↗" })).toBeInTheDocument();
  });

  it("returns to the form from the settled card, clearing the finished op", () => {
    const onReset = vi.fn();
    renderForm({ progress: progress("mined", true), txHash: "0xabc", onReset });
    press("Done");
    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("amount")).toBeVisible();
    expect(screen.getByLabelText("amount").closest("[hidden]")).toBeNull();
  });

  it("does not show a settled card for an op with no transaction to point at", () => {
    renderForm({ progress: progress("mined", true) });
    expect(screen.getByLabelText("amount").closest("[hidden]")).toBeNull();
  });

  it("shows the failure, and Try again runs the form's own submit", () => {
    const { onSubmit } = renderForm({
      error: new Error("relayer timed out"),
      progress: progress("failed", true),
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't submit");
    press("Try again");
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Back home" })).toHaveAttribute("href", "/");
  });

  it("claims nothing about the funds unless the form can vouch for it", () => {
    renderForm({ error: new Error("x") });
    expect(screen.queryByText(/nothing was spent/i)).not.toBeInTheDocument();
  });

  it("hands an after function the card's view, so it can step aside while the op runs", () => {
    const after = vi.fn((view: string) => <p>after: {view}</p>);
    const { rerenderWith } = renderForm({ after });
    expect(screen.getByText("after: form")).toBeInTheDocument();
    rerenderWith({ after, busy: true, progress: progress("proving") });
    expect(screen.getByText("after: progress")).toBeInTheDocument();
  });
});
