// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { VoteEligibility } from "@/features/governance";
import { routerWrapper } from "@/test/render";
import { VotePanel, type VotePanelProps } from "./VotePanel";

vi.mock("@/features/chain", () => ({ useTxExplorerUrl: () => () => undefined }));

const E18 = 10n ** 18n;

function renderPanel(over: Partial<VotePanelProps> = {}) {
  const onVote = vi.fn();
  const props: VotePanelProps = {
    eligibility: { ok: true, quorumVoteOpen: true },
    now: 200,
    voteStart: 100,
    voteEnd: 400,
    quorumVoteDeadline: 340,
    weight: 12n * E18,
    decimals: 18,
    symbol: "LNT",
    onVote,
    tx: { status: "idle", error: null, hash: undefined, reset: vi.fn() },
    ...over,
  };
  render(<VotePanel {...props} />, { wrapper: routerWrapper });
  return { onVote, props };
}

const option = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;

describe("VotePanel", () => {
  it("shows both clocks", () => {
    renderPanel();
    expect(screen.getByText("For / Abstain")).toBeInTheDocument();
    expect(screen.getByText("close in 2m 20s")).toBeInTheDocument();
    expect(screen.getByText("closes in 3m 20s")).toBeInTheDocument();
  });

  it("sends the chosen support and trimmed reason", () => {
    const { onVote } = renderPanel();
    const submit = screen.getByRole("button", { name: /Choose For/ });
    expect(submit).toBeDisabled();

    fireEvent.click(option("Abstain"));
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "  because  " } });
    const vote = screen.getByRole("button", { name: "Vote Abstain with 12 LNT" });
    fireEvent.click(vote);

    expect(onVote).toHaveBeenCalledWith(2, "because");
  });

  it("disables For and Abstain after the quorum-vote deadline and says why", () => {
    const { onVote } = renderPanel({ eligibility: { ok: true, quorumVoteOpen: false }, now: 350 });
    expect(option("For")).toBeDisabled();
    expect(option("Abstain")).toBeDisabled();
    expect(option("Against")).not.toBeDisabled();
    expect(screen.getByText("Only Against is still open")).toBeInTheDocument();
    expect(screen.getByText("closed")).toBeInTheDocument();

    fireEvent.click(option("Against"));
    fireEvent.click(screen.getByRole("button", { name: /Vote Against/ }));
    expect(onVote).toHaveBeenCalledWith(0, "");
  });

  it.each([
    ["no-signer", /Read-only session/],
    ["not-delegated", /no votes on this proposal/],
    ["delegated-after-snapshot", /delegation came after/],
    ["already-voted", /You have voted/],
    ["not-active", /Voting is not open/],
  ] as const)("explains %s instead of offering the form", (reason, title) => {
    renderPanel({ eligibility: { ok: false, reason } as VoteEligibility });
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("uses the session's own sentence for a passkey", () => {
    renderPanel({
      eligibility: { ok: false, reason: "no-signer" },
      signerReason: "Connect a browser wallet to take part.",
    });
    expect(screen.getByText("Connect a browser wallet to take part.")).toBeInTheDocument();
  });

  it("says it is loading while eligibility is unknown", () => {
    renderPanel({ eligibility: undefined });
    expect(screen.getByText(/Reading your voting power/)).toBeInTheDocument();
  });

  it("replaces the form with the transaction's progress, then its outcome", () => {
    const reset = vi.fn();
    const { rerender } = render(
      <VotePanel
        eligibility={{ ok: true, quorumVoteOpen: true }}
        now={200}
        voteStart={100}
        voteEnd={400}
        weight={1n}
        decimals={0}
        symbol="LNT"
        onVote={vi.fn()}
        tx={{ status: "pending", error: null, hash: undefined, reset }}
      />,
      { wrapper: routerWrapper },
    );
    expect(screen.getByText("Waiting for your wallet")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();

    rerender(
      <VotePanel
        eligibility={{ ok: true, quorumVoteOpen: true }}
        now={200}
        voteStart={100}
        voteEnd={400}
        weight={1n}
        decimals={0}
        symbol="LNT"
        onVote={vi.fn()}
        tx={{
          status: "error",
          error: { data: "0x" },
          hash: undefined,
          reset,
        }}
      />,
    );
    expect(screen.getByText("Your vote did not go through")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalled();
  });
});
