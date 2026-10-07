import { evmAddress, type RegisterNameResult } from "@lelantos-org/sdk";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChainEntry } from "@/config/chains";
import type { ActionMutation, RegisterNameCall } from "@/features/ops";
import { fakeActionMutation, idleProgress } from "@/test/fakes/operation";
import { fakeWalletApi, fakeWalletContext } from "@/test/fakes/wallet";
import { hexAddress, SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import { makeAsset, USDC_ASSET } from "@/test/fixtures/assets";
import { makeChain } from "@/test/fixtures/chains";
import { fill, press, pressAndSettle } from "@/test/interact";
import { appWrapper } from "@/test/render";
import { lastArg } from "@/test/spies";
import { ClaimNameForm } from "./ClaimNameForm";

const REGISTRAR = evmAddress(hexAddress("77"));
const ETH_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
/// The address the wallet publishes: not `SHIELDED_ADDRESS`, the one it hands out.
const PUBLISHED = SHIELDED_ADDRESS.replace("lelantos1kywv", "lelantos1pubd");
const NAME = "mehow.lelantos.xyz";
const DAI = makeAsset(2n, "DAI");
const ZERO = "0x0000000000000000000000000000000000000000";

type Action = ActionMutation<RegisterNameCall, RegisterNameResult>;

const { state, resetState } = vi.hoisted(() => {
  const defaults = () => ({
    registrar: true,
    capable: true,
    taken: new Set<string>(),
    checkFailed: false,
    fee: 5_000_000n as bigint | undefined,
    feeToken: undefined as string | undefined,
    balance: 9_000_000n,
    record: undefined as { registered: boolean; controller: string } | undefined,
    claimed: undefined as { label: string; address: string; claimedAt: number } | undefined,
    action: undefined as unknown,
    relayerQuote: {
      data: { charged: true, options: [{ asset: { id: 1n }, baseUnits: 250_000n }] },
      isError: false,
    } as unknown,
  });
  const state = defaults();
  return { state, resetState: () => void Object.assign(state, defaults()) };
});
const mutateAsync = vi.fn(
  async (_: RegisterNameCall) => ({ txHash: "0x1" }) as unknown as RegisterNameResult,
);
const useNameAvailable = vi.fn((_chain: unknown, label: string | undefined) => ({
  data: label === undefined || state.checkFailed ? undefined : !state.taken.has(label),
  isError: label !== undefined && state.checkFailed,
  refetch: vi.fn(),
}));
const useFeeQuote = vi.fn((_kind: string) => state.relayerQuote);
const rememberClaimedHandle = vi.fn();

function chain(): ChainEntry {
  return makeChain({
    chainName: "Anvil",
    nameParents: ["lelantos.xyz"],
    tokens: [USDC_ASSET, DAI],
    ...(state.registrar ? { nameRegistrarAddress: REGISTRAR } : {}),
  });
}

vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  ...(await import("@/test/fakes/assets")).assetReads(() => ({
    assets: [USDC_ASSET, DAI],
    balance: state.balance,
  })),
  useBalances: () => ({
    isLoading: false,
    data: { balances: [1n, 2n].map((asset) => ({ asset, balance: state.balance })) },
  }),
}));
vi.mock("@/features/chain", async () =>
  (await import("@/test/fakes/chain")).activeChainHooks(() => chain()),
);
vi.mock("@/features/wallet", async () => ({
  ...(await import("@/test/fakes/wallet")).spendFormWalletHooks(),
  useWallet: () => fakeWalletContext({ ethAddress: ETH_ACCOUNT }),
  useWalletInstance: () =>
    fakeWalletApi({ address: SHIELDED_ADDRESS, capabilities: { registerName: state.capable } }),
}));
vi.mock("@/features/names", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/names")>()),
  useNameAvailable: (c: unknown, label: string | undefined) => useNameAvailable(c, label),
  useNameFee: () => ({
    data:
      state.fee === undefined
        ? undefined
        : { token: state.feeToken ?? USDC_ASSET.token, amount: state.fee },
    isError: false,
    refetch: vi.fn(),
  }),
  useNameRecord: () => ({ data: state.record }),
  useClaimedHandle: () => state.claimed,
  rememberClaimedHandle: (...a: unknown[]) => rememberClaimedHandle(...a),
}));
vi.mock("@/features/fees", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/fees")>()),
  useFeeQuote: (kind: string) => useFeeQuote(kind),
}));
vi.mock("./use-published-address", () => ({
  usePublishedAddress: () => ({ data: PUBLISHED, isError: false, refetch: vi.fn() }),
}));
vi.mock("./use-register-name", () => ({
  useRegisterName: () => (state.action as Action | undefined) ?? fakeActionMutation(mutateAsync),
}));

const open = () => render(<ClaimNameForm />, { wrapper: appWrapper });

/// Type a handle and let the availability check catch up with it.
function typeHandle(text: string) {
  fill("Handle", text);
  act(() => void vi.advanceTimersByTime(400));
}

const why = () => document.querySelector(".action-form__why")?.textContent;
const ack = () => screen.getByRole("checkbox", { name: /public and cannot be made private/ });
const fees = () => screen.getByRole("region", { name: "Fees" });

/// The card shown in place of the form, saying `reason`.
function expectUnavailable(reason: RegExp) {
  expect(screen.getByRole("heading", { name: "Handles unavailable" })).toBeInTheDocument();
  expect(screen.getByText(reason)).toBeInTheDocument();
  expect(screen.queryByLabelText("Handle")).not.toBeInTheDocument();
}

function landed(registered: boolean | undefined): Action {
  const result = {
    kind: "registerName",
    txHash: "0xabc",
    label: "mehow",
    address: PUBLISHED,
    controller: hexAddress("c0"),
    registered,
    registrationFee: { asset: 1n, amount: 5_000_000n, baseUnits: 5_000_000n },
    fees: { relayer: { asset: 1n, amount: 20_000n, baseUnits: 20_000n }, protocol: null },
    commitments: ["0xcm"],
  } as unknown as RegisterNameResult;
  const action = fakeActionMutation<RegisterNameCall, RegisterNameResult>();
  return {
    mutation: { ...action.mutation, data: result } as Action["mutation"],
    progress: {
      ...idleProgress(),
      steps: [{ id: "mined", label: "Confirmed on-chain" }],
      phase: "mined",
      done: true,
      endedAs: "mined",
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetState();
});
afterEach(() => vi.useRealTimers());

describe("ClaimNameForm availability", () => {
  it("explains itself on a network with no registrar", () => {
    state.registrar = false;
    open();
    expectUnavailable(/Anvil has no handle registrar/);
  });

  it("explains itself for a wallet that cannot register", () => {
    state.capable = false;
    open();
    expectUnavailable(/This wallet can't claim a handle here/);
  });

  it("explains itself where the registrar's fee token is not a pool asset", () => {
    state.feeToken = hexAddress("ab");
    open();
    expectUnavailable(/The registrar's fee token is not a pool asset here/);
  });
});

describe("ClaimNameForm", () => {
  it("shows in full the address that will be published, before anything is submitted", () => {
    open();
    const section = screen.getByRole("region", { name: "Address that will be published" });
    expect(section).toHaveTextContent(PUBLISHED);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("never shows the wallet's EVM account, nor its everyday shielded address", () => {
    open();
    typeHandle("mehow");
    const page = document.body.textContent ?? "";
    expect(page).not.toContain(ETH_ACCOUNT);
    expect(page.toLowerCase()).not.toContain(ETH_ACCOUNT.toLowerCase().slice(2, 12));
    expect(page).not.toContain(SHIELDED_ADDRESS);
  });

  it("says in plain words that the handle and the address become public for good", () => {
    open();
    typeHandle("mehow");
    expect(screen.getByText("This is public, and it is permanent")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Claiming writes mehow\.lelantos\.xyz and the address above to the blockchain, where anyone can read them\. They stay in its history for good/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/No public account of yours is named/)).toBeInTheDocument();
  });

  it("validates the handle as it is typed, without asking the registrar", () => {
    open();

    typeHandle("Me");
    expect(screen.getByRole("status")).toHaveTextContent("3 to 32 characters");
    expect(screen.getByLabelText("Handle")).toBeInvalid();

    typeHandle("mehow.lelantos.eth");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Only names ending in .lelantos.xyz are served here.",
    );
    expect(useNameAvailable.mock.calls.every(([, label]) => label === undefined)).toBe(true);
    expect(screen.getByRole("button", { name: "Claim handle" })).toBeDisabled();
  });

  it("checks availability only once typing pauses", () => {
    open();

    fill("Handle", "meh");
    fill("Handle", "mehow");
    expect(lastArg(useNameAvailable, 1)).toBeUndefined();
    expect(screen.getByRole("status")).toHaveTextContent(`Checking ${NAME}…`);
    expect(why()).toBe("Checking that the handle is free");

    act(() => void vi.advanceTimersByTime(400));
    expect(lastArg(useNameAvailable, 1)).toBe("mehow");
    expect(useNameAvailable.mock.calls.some(([, label]) => label === "meh")).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent(`${NAME} is available`);
  });

  it("accepts the handle written under the served parent, or with an @", () => {
    open();
    typeHandle("@Mehow.Lelantos.xyz");
    expect(screen.getByRole("status")).toHaveTextContent(`${NAME} is available`);
    expect(lastArg(useNameAvailable, 1)).toBe("mehow");
  });

  it("holds a taken handle, and links to who holds it", () => {
    state.taken.add("mehow");
    open();
    typeHandle("mehow");

    expect(screen.getByRole("status")).toHaveTextContent(`${NAME} is taken.`);
    expect(screen.getByRole("link", { name: /See who holds it/ })).toHaveAttribute(
      "href",
      "/profile#mehow",
    );
    expect(why()).toBe("That handle is taken");
    expect(screen.getByRole("button", { name: `Claim ${NAME}` })).toBeDisabled();
  });

  it("holds when the check failed, and offers to run it again", () => {
    state.checkFailed = true;
    open();
    typeHandle("mehow");

    expect(screen.getByRole("status")).toHaveTextContent(`Couldn't check whether ${NAME} is free.`);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(why()).toBe("Couldn't check that the handle is free");
  });

  it("shows the registrar's fee and the relayer's quote before anything is submitted", () => {
    open();
    expect(fees()).toHaveTextContent("Registrar fee5.00 USDC");
    expect(fees()).toHaveTextContent("Relayer fee0.25 USDC");
    expect(fees()).toHaveTextContent("Both are paid from your shielded USDC");
    expect(useFeeQuote).toHaveBeenCalledWith("registerName");
  });

  it.each([
    ["is still being quoted", { data: undefined, isError: false }, "Quoting…"],
    ["could not be quoted", { data: undefined, isError: true }, "Quoted when you submit"],
    [
      "is not payable in the funding asset",
      { data: { charged: true, options: [] }, isError: false },
      "Not payable in USDC",
    ],
    ["is not charged", { data: { charged: false, options: [] }, isError: false }, "None"],
  ])("says so when the relayer's fee %s", (_, quote, shown) => {
    state.relayerQuote = quote;
    open();
    expect(fees()).toHaveTextContent(`Relayer fee${shown}`);
  });

  it("waits for the registrar's fee before it lets a claim through", () => {
    state.fee = undefined;
    open();
    typeHandle("mehow");
    expect(fees()).toHaveTextContent("Reading…");
    expect(why()).toBe("Reading the registrar's fee");
  });

  it("holds a wallet that cannot cover the registrar's fee", () => {
    state.balance = 1_000_000n;
    open();
    typeHandle("mehow");
    expect(why()).toBe(
      "You need more than 5.00 USDC shielded to pay the registrar and the relayer",
    );
  });

  it("always names the pool asset of the registrar's fee token to the wallet", async () => {
    state.feeToken = DAI.token.toUpperCase().replace("0X", "0x");
    state.fee = 10n ** 18n;
    state.balance = 5n * 10n ** 18n;
    open();
    expect(fees()).toHaveTextContent("Registrar fee1.00 DAI");
    expect(screen.queryByLabelText("Asset to pay from")).not.toBeInTheDocument();

    typeHandle("mehow");
    press(ack());
    await pressAndSettle(`Claim ${NAME}`);
    expect(mutateAsync.mock.calls).toEqual([[{ label: "mehow", asset: DAI.id }]]);
  });

  it("lets a free registration be paid from an asset the user picks, defaulting to one held", async () => {
    state.fee = 0n;
    state.feeToken = ZERO;
    open();
    expect(fees()).toHaveTextContent("Registrar feeFree");
    expect(screen.getByLabelText("Asset to pay from")).toHaveValue("1");

    fill("Asset to pay from", "2");
    typeHandle("mehow");
    press(ack());
    await pressAndSettle(`Claim ${NAME}`);
    expect(mutateAsync.mock.calls).toEqual([[{ label: "mehow", asset: DAI.id }]]);
  });

  it("holds a free registration while the wallet holds nothing to pay the relayer with", () => {
    state.fee = 0n;
    state.feeToken = ZERO;
    state.balance = 0n;
    open();
    typeHandle("mehow");
    expect(screen.getByLabelText("Asset to pay from")).toHaveValue("");
    expect(why()).toBe("You need shielded funds to pay the relayer");
  });

  it("submits nothing until the publish confirmation is ticked", async () => {
    open();
    expect(ack()).toBeDisabled();

    typeHandle("mehow");
    const claim = screen.getByRole("button", { name: `Claim ${NAME}` });
    expect(claim).toBeDisabled();
    expect(why()).toBe("Tick the box to confirm you understand what becomes public");

    press(ack());
    expect(claim).toBeEnabled();
    await pressAndSettle(claim);
    expect(mutateAsync.mock.calls).toEqual([[{ label: "mehow", asset: 1n }]]);
    expect(JSON.stringify(mutateAsync.mock.calls, (_, v) => String(v))).not.toContain(ETH_ACCOUNT);
  });

  it("asks for the confirmation again when the handle changes", () => {
    open();
    typeHandle("mehow");
    press(ack());
    expect(ack()).toBeChecked();

    typeHandle("mehow2");
    expect(ack()).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Claim mehow2.lelantos.xyz" })).toBeDisabled();
  });

  it("shows the handle this account already holds, with the way to its profile", () => {
    state.claimed = { label: "mehow", address: PUBLISHED, claimedAt: 1 };
    open();
    expect(screen.getByText(`Your handle is ${NAME}`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View its profile" })).toHaveAttribute(
      "href",
      "/profile#mehow",
    );
  });
});

describe("ClaimNameForm outcome", () => {
  it("says the handle is the user's, and links to its profile", () => {
    state.action = landed(true);
    open();

    const card = screen.getByRole("status", { name: "Handle claimed" });
    expect(card).toHaveTextContent("mehow.lelantos.xyz is yours.");
    expect(card).toHaveTextContent(
      "Fees paid: 5.00 USDC to the registrar, 0.02 USDC to the relayer.",
    );
    expect(card.querySelector(".txcard__ring--warn")).toBeNull();
    expect(screen.getByRole("link", { name: `View ${NAME}` })).toHaveAttribute(
      "href",
      "/profile#mehow",
    );
  });

  it("says a refunded handle was not claimed and only fees were spent", () => {
    state.action = landed(false);
    open();

    const card = screen.getByRole("status", { name: "Handle not claimed" });
    expect(card).toHaveTextContent("mehow.lelantos.xyz was not registered");
    expect(card).toHaveTextContent("coming back to your shielded balance as a new note");
    expect(card).toHaveTextContent("Fees paid: 0.02 USDC to the relayer.");
    expect(card).not.toHaveTextContent("to the registrar,");
    expect(card.querySelector(".txcard__ring--warn")).not.toBeNull();
    expect(screen.queryByRole("link", { name: /mehow\.lelantos\.xyz/ })).not.toBeInTheDocument();
  });

  it("claims neither when the receipt could not be read, and offers to check", () => {
    state.action = landed(undefined);
    open();

    const card = screen.getByRole("status", { name: "Sent, outcome not known yet" });
    expect(card).toHaveTextContent("it is not known whether mehow.lelantos.xyz was claimed");
    expect(card.querySelector(".txcard__ring--warn")).not.toBeNull();
    expect(screen.getByRole("link", { name: `Check ${NAME}` })).toHaveAttribute(
      "href",
      "/profile#mehow",
    );
    expect(rememberClaimedHandle).not.toHaveBeenCalled();
  });

  it("settles an unread receipt from the registrar's record, and remembers the handle then", () => {
    state.action = landed(undefined);
    state.record = { registered: true, controller: hexAddress("c0") };
    open();

    expect(screen.getByRole("status", { name: "Handle claimed" })).toBeInTheDocument();
    expect(rememberClaimedHandle).toHaveBeenCalledWith(
      31337n,
      SHIELDED_ADDRESS,
      expect.objectContaining({ label: "mehow", address: PUBLISHED }),
    );
  });

  it("reads an unread receipt as refunded once the record names another controller", () => {
    state.action = landed(undefined);
    state.record = { registered: true, controller: hexAddress("ee") };
    open();

    expect(screen.getByRole("status", { name: "Handle not claimed" })).toBeInTheDocument();
    expect(rememberClaimedHandle).not.toHaveBeenCalled();
  });
});
