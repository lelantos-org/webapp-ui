import { evmAddress } from "@lelantos-org/sdk";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { decodeFunctionData } from "viem";
import { describe, expect, it, vi } from "vitest";
import { knownContracts } from "@/features/governance";
import { fill, press } from "@/test/interact";
import { CreateProposalForm } from "./CreateProposalForm";

const GOVERNOR = evmAddress("0x5555555555555555555555555555555555555555");
const TOKEN = evmAddress("0x6666666666666666666666666666666666666666");
const OTHER = "0x7777777777777777777777777777777777777777";
const contracts = knownContracts({ governorAddress: GOVERNOR, govTokenAddress: TOKEN });

function setup(blocked?: string) {
  const onSubmit = vi.fn();
  render(<CreateProposalForm contracts={contracts} blocked={blocked} onSubmit={onSubmit} />);
  return { onSubmit };
}

const action = (n: number) => screen.getByRole("region", { name: `Action ${n}` });

describe("CreateProposalForm", () => {
  it("requires a title and a complete action", async () => {
    const { onSubmit } = setup();
    press("Submit proposal");
    expect(await screen.findByText("Give the proposal a title")).toBeInTheDocument();
    expect(screen.getByText("Choose a function")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("encodes a picked function with typed arguments and submits title + description", async () => {
    const { onSubmit } = setup();
    fill("Title", "Set cutoff");
    fill("Description", "One day.");

    const row = within(action(1));
    expect(row.getByLabelText("Target contract")).toHaveValue(GOVERNOR);
    fireEvent.change(row.getByLabelText("Function"), {
      target: { value: "setQuorumVoteCutoff(uint32)" },
    });
    fireEvent.change(await row.findByLabelText(/newQuorumVoteCutoff/), {
      target: { value: "86400" },
    });

    await waitFor(() => expect(screen.queryByText("Action 1 is incomplete.")).toBeNull());
    press("Submit proposal");

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const [actions, description] = onSubmit.mock.calls[0] as [
      { target: string; value: bigint; calldata: `0x${string}` }[],
      string,
    ];
    expect(description).toBe("# Set cutoff\n\nOne day.");
    expect(actions).toHaveLength(1);
    expect(actions[0]?.target).toBe(GOVERNOR);
    const decoded = decodeFunctionData({
      abi: contracts[0]!.functions,
      data: actions[0]!.calldata,
    });
    // viem decodes widths up to 48 bits as numbers.
    expect(decoded.args).toEqual([86400]);
  });

  it("shows an argument's error under its field", async () => {
    setup();
    fill("Title", "T");
    const row = within(action(1));
    fireEvent.change(row.getByLabelText("Function"), {
      target: { value: "setQuorumVoteCutoff(uint32)" },
    });
    fireEvent.change(await row.findByLabelText(/newQuorumVoteCutoff/), {
      target: { value: "99999999999" },
    });
    press("Submit proposal");
    expect(await screen.findByText("Out of range for uint32")).toBeInTheDocument();
  });

  it("switches the target when the contract changes, and takes raw calldata", async () => {
    const { onSubmit } = setup();
    fill("Title", "Raw");
    press("Add another action");
    const second = within(action(2));

    fireEvent.change(second.getByLabelText("Contract"), { target: { value: "token" } });
    expect(second.getByLabelText("Target contract")).toHaveValue(TOKEN);

    fireEvent.click(second.getByRole("button", { name: "Raw calldata" }));
    fireEvent.change(second.getByLabelText("Target contract"), { target: { value: OTHER } });
    fireEvent.change(await second.findByLabelText("Calldata"), { target: { value: "0xabcd" } });
    fireEvent.change(second.getByLabelText("ETH sent with the call"), {
      target: { value: "0.5" },
    });

    fireEvent.click(within(action(1)).getByRole("button", { name: "Remove" }));
    press("Submit proposal");
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual([
      { target: evmAddress(OTHER), value: 500_000_000_000_000_000n, calldata: "0xabcd" },
    ]);
    expect(onSubmit.mock.calls[0]?.[1]).toBe("# Raw");
  });

  it("keeps the submit dead, with the reason, when the account may not propose", () => {
    setup("Proposing needs 1 LNT of voting power; you have 0.");
    expect(screen.getByRole("button", { name: "Submit proposal" })).toBeDisabled();
    expect(screen.getByText(/Proposing needs 1 LNT/)).toBeInTheDocument();
  });
});
