import { evmAddress } from "@lelantos-org/sdk";
import { act, render, screen, within } from "@testing-library/react";
import { useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChainEntry } from "@/config/chains";
import { hexAddress, SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import { makeChain } from "@/test/fixtures/chains";
import { press, pressAndSettle } from "@/test/interact";
import { appWrapperAt } from "@/test/render";
import { lastArg } from "@/test/spies";
import { ProfilePage } from "./ProfilePage";

const REGISTRAR = evmAddress(hexAddress("77"));
const NAMED = makeChain({
  chainId: 10n,
  chainName: "Optimism",
  nameRegistrarAddress: REGISTRAR,
  nameParents: ["lelantos.xyz"],
});
const PLAIN = makeChain({ chainId: 1n, chainName: "Ethereum" });
const NAME = "mehow.lelantos.xyz";

const state = vi.hoisted(() => ({
  registry: [] as ChainEntry[],
  networks: { loaded: true, failed: false },
  record: undefined as { registered: boolean; value: string } | undefined,
  recordFailed: false,
  payable: true as boolean | undefined,
}));
const refetchRecord = vi.fn();
const useEarlyChainRegistry = vi.fn((_enabled: boolean) => state.networks);
const useNameRecord = vi.fn((_chain: ChainEntry | undefined, _label: string | undefined) => ({
  data: state.record,
  isError: state.recordFailed,
  refetch: refetchRecord,
}));

vi.mock("@/features/chain", () => ({
  useChainRegistry: () => state.registry,
  useEarlyChainRegistry: (enabled: boolean) => useEarlyChainRegistry(enabled),
}));
vi.mock("@/features/names", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/names")>()),
  useNameRecord: (c: ChainEntry | undefined, l: string | undefined) => useNameRecord(c, l),
}));

vi.mock("./use-payable-address", () => ({
  usePayableAddress: (address: string | undefined) =>
    address === undefined ? undefined : state.payable,
}));

const open = (fragment: string) =>
  render(<ProfilePage />, { wrapper: appWrapperAt(`/profile${fragment}`) });
const payLink = () => screen.queryByRole("link", { name: /Pay/ });
/// Whether the registrar was asked about no label at all.
const lookedNothingUp = () => useNameRecord.mock.calls.every(([, label]) => label === undefined);

beforeEach(() => {
  Object.assign(state, {
    registry: [PLAIN, NAMED],
    networks: { loaded: true, failed: false },
    record: { registered: true, value: SHIELDED_ADDRESS },
    recordFailed: false,
    payable: true,
  });
});

describe("ProfilePage", () => {
  it("offers no payment until the address has decoded in full", () => {
    state.payable = undefined;
    open("#mehow");
    expect(payLink()).not.toBeInTheDocument();
    expect(screen.getByText(`Looking up ${NAME}`)).toBeInTheDocument();
  });

  it("refuses to pay a record that looks like an address but does not decode", () => {
    state.payable = false;
    open("#mehow");
    expect(payLink()).not.toBeInTheDocument();
    expect(screen.getByText(`${NAME} can't be paid`)).toBeInTheDocument();
  });

  it("shows the handle's name, its fingerprint, its address in full, and a way to pay it", () => {
    open("#mehow");

    expect(screen.getByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();
    expect(screen.getByText("A Lelantos handle on Optimism")).toBeInTheDocument();
    const card = screen.getByRole("region", { name: `Pay ${NAME}` });
    expect(within(card).getByText("Fingerprint")).toBeInTheDocument();
    expect(card).toHaveTextContent(SHIELDED_ADDRESS);
    expect(card.querySelector("details")).toBeNull();
    expect(screen.getByRole("link", { name: `Pay ${NAME}` })).toHaveAttribute(
      "href",
      `/send#to=${SHIELDED_ADDRESS}`,
    );
  });

  it("copies the address whole", async () => {
    const writeText = vi.fn(async (_: string) => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    open("#mehow");

    await pressAndSettle("Copy address");

    expect(writeText).toHaveBeenCalledWith(SHIELDED_ADDRESS);
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("reads the registrar's chain, whatever chain a wallet is on, and needs no wallet", () => {
    open("#mehow");
    expect(lastArg(useNameRecord, 0)).toBe(NAMED);
    expect(lastArg(useNameRecord, 1)).toBe("mehow");
    // The registry is fetched without a connection.
    expect(useEarlyChainRegistry).toHaveBeenCalledWith(true);
  });

  it.each([
    ["under the served parent", "#mehow.lelantos.xyz"],
    ["with an @", "#@mehow"],
    ["percent-encoded", "#%40Mehow"],
  ])("reads a handle written %s", (_, fragment) => {
    open(fragment);
    expect(lastArg(useNameRecord, 1)).toBe("mehow");
    expect(screen.getByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();
  });

  it("takes the handle from the fragment only, never from the path or the query", () => {
    render(<ProfilePage />, { wrapper: appWrapperAt("/profile?name=mehow") });
    expect(screen.getByText("No handle in this link")).toBeInTheDocument();
    expect(lookedNothingUp()).toBe(true);
  });

  it("shows the name under @ where the chain lists no parent", () => {
    state.registry = [makeChain({ nameRegistrarAddress: REGISTRAR })];
    open("#mehow");
    expect(screen.getByRole("heading", { level: 1, name: "@mehow" })).toBeInTheDocument();
  });

  it("is loading until the record lands", () => {
    state.record = undefined;
    open("#mehow");
    expect(screen.getByRole("status")).toHaveTextContent(`Looking up ${NAME}`);
    expect(payLink()).not.toBeInTheDocument();
  });

  it("says when nobody has claimed the handle", () => {
    state.record = { registered: false, value: "" };
    open("#mehow");
    expect(screen.getByRole("heading", { name: `${NAME} is not claimed` })).toBeInTheDocument();
    expect(payLink()).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Claim a handle" })).toHaveAttribute("href", "/name");
  });

  it("says when a registered handle publishes nothing", () => {
    state.record = { registered: true, value: "" };
    open("#mehow");
    expect(
      screen.getByRole("heading", { name: `${NAME} publishes no address` }),
    ).toBeInTheDocument();
    expect(payLink()).not.toBeInTheDocument();
  });

  it("offers no payment to a value that is not a shielded address, and does not print it", () => {
    state.record = { registered: true, value: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" };
    open("#mehow");
    expect(screen.getByRole("alert")).toHaveTextContent(`${NAME} can't be paid`);
    expect(screen.getByRole("alert")).toHaveTextContent("Do not send to it.");
    expect(document.body.textContent).not.toContain("0xf39F");
    expect(payLink()).not.toBeInTheDocument();
  });

  it.each([
    ["a look-alike parent", "#mehow.lelantos.eth"],
    ["a parent one letter off", "#mehow.lelantoz.xyz"],
    ["a served parent nested under another", "#mehow.lelantos.xyz.evil.example"],
  ])("refuses %s outright, and looks nothing up for it", (_, fragment) => {
    open(fragment);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This name is not served here");
    expect(alert).toHaveTextContent(
      `“${fragment.slice(1)}” is under a name this app does not serve`,
    );
    expect(alert).toHaveTextContent("Only names ending in .lelantos.xyz are served here.");
    expect(alert).toHaveTextContent("belongs to someone else");
    expect(lookedNothingUp()).toBe(true);
    expect(payLink()).not.toBeInTheDocument();
  });

  it("refuses a malformed handle, and looks nothing up for it", () => {
    open("#me");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This is not a handle");
    expect(alert).toHaveTextContent("3 to 32 characters");
    expect(lookedNothingUp()).toBe(true);
  });

  it("says when no network offers handles, once the networks are known", () => {
    state.registry = [PLAIN];
    open("#mehow");
    expect(screen.getByRole("heading", { name: "Handles are not available" })).toBeInTheDocument();
  });

  it("keeps waiting while the networks are still loading", () => {
    state.registry = [];
    state.networks = { loaded: false, failed: false };
    open("#mehow");
    expect(screen.getByRole("status")).toHaveTextContent("Loading the networks");
  });

  it("offers to retry when the networks did not load", () => {
    state.registry = [];
    state.networks = { loaded: false, failed: true };
    open("#mehow");
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the networks");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("offers to retry a read that failed, without claiming the handle is free", () => {
    state.record = undefined;
    state.recordFailed = true;
    open("#mehow");

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(`Couldn't look up ${NAME}`);
    expect(alert).toHaveTextContent("This says nothing about whether it is claimed.");
    press("Try again");
    expect(refetchRecord).toHaveBeenCalledOnce();
  });

  it("follows the fragment to another handle, but not onto the skip link's anchor", () => {
    let go: (to: string) => void = () => {};
    function Harness() {
      go = useNavigate();
      return <ProfilePage />;
    }
    render(<Harness />, { wrapper: appWrapperAt("/profile#mehow") });

    act(() => go("/profile#main"));
    expect(screen.getByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();

    act(() => go("/profile#alice"));
    expect(
      screen.getByRole("heading", { level: 1, name: "alice.lelantos.xyz" }),
    ).toBeInTheDocument();
  });

  it("opens the profile of a handle that happens to be the anchor's name", () => {
    open("#main");
    expect(
      screen.getByRole("heading", { level: 1, name: "main.lelantos.xyz" }),
    ).toBeInTheDocument();
  });
});
