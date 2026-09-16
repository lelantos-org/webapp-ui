// @vitest-environment jsdom
// The branch that decides whether the user is asked at all, and that a named
// wallet reaches the store as a name. Before the picker existed every connect
// was `connect(undefined)`, which is exactly the case these pin down.

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eip1193Store } from "@/features/wallet-kinds";
import { stubWebAuthn } from "@/test/dom";
import { announce, detail } from "@/test/fakes/eip6963";
import { useConnectFlow } from "./use-connect-flow";
import type { WalletChoice } from "./wallet-offerings";

/// Two extensions, so the flow has a choice to put to the user.
function announceBoth() {
  announce(detail("uuid-mm", "io.metamask"));
  announce(detail("uuid-rb", "io.rabby"));
}

describe("useConnectFlow", () => {
  beforeEach(() => {
    // Module singleton: without this each case inherits the previous one's
    // `discovered` list and the length branch below is decided by file order.
    eip1193Store.resetForTest();
    eip1193Store.startDiscovery();
    localStorage.clear();
    // These cases are about the extension branch, so the passkey row is kept
    // out of the list: `passkeysAvailable()` is false in jsdom without a
    // secure context, but stubbing it explicitly keeps the branch from
    // depending on that.
    vi.stubGlobal("isSecureContext", false);
  });

  it("connects straight away when there is nothing to choose between", () => {
    const connect = vi.spyOn(eip1193Store, "connect").mockResolvedValue();
    const { result } = renderHook(() => useConnectFlow());

    act(() => result.current.begin());
    // No rdns: `selectKind` passes the id through and this branch has none to
    // pass, which is the same instruction `connect()` took before — pick from
    // whatever announces.
    expect(connect).toHaveBeenCalledWith(undefined);

    announce(detail("uuid-mm", "io.metamask"));
    act(() => result.current.begin());

    // Zero and one are the same branch: `connect()` waits out the announce
    // window itself and reports "no wallet detected" if it stays empty.
    expect(connect).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenLastCalledWith(undefined);
    expect(result.current.choices).toBeNull();
  });

  it("detaches the injected wallet when a passkey is chosen", () => {
    // The pick has to survive `WALLET_KINDS`' priority order, which the injected
    // kind wins. With the extension left attached — and `resumeFromStorage`
    // reattaches it silently on load — choosing a passkey connected the passkey
    // and then handed the session straight back to the wallet.
    const disconnect = vi.spyOn(eip1193Store, "disconnect").mockImplementation(() => {});
    const connect = vi.spyOn(eip1193Store, "connect").mockResolvedValue();
    const { result } = renderHook(() => useConnectFlow());

    act(() => result.current.choose({ kind: "passkey", id: "passkey", name: "Passkey" }));

    expect(disconnect).toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("does not detach the injected wallet when an injected wallet is chosen", () => {
    const disconnect = vi.spyOn(eip1193Store, "disconnect").mockImplementation(() => {});
    const connect = vi.spyOn(eip1193Store, "connect").mockResolvedValue();
    const { result } = renderHook(() => useConnectFlow());

    act(() =>
      result.current.choose({
        kind: "eip1193",
        id: "io.metamask",
        name: "MetaMask",
      } as WalletChoice),
    );

    expect(disconnect).not.toHaveBeenCalled();
    expect(connect).toHaveBeenCalledWith("io.metamask");
  });

  it("opens the picker once a second wallet has announced", () => {
    const connect = vi.spyOn(eip1193Store, "connect").mockResolvedValue();
    announceBoth();
    const { result } = renderHook(() => useConnectFlow());

    act(() => result.current.begin());

    expect(connect).not.toHaveBeenCalled();
    expect(result.current.choices?.map((w) => w.id)).toEqual(["io.metamask", "io.rabby"]);
  });

  it("puts the remembered wallet first", () => {
    localStorage.setItem("lelantos:wallet:preferred-rdns", "io.rabby");
    announceBoth();
    const { result } = renderHook(() => useConnectFlow());

    act(() => result.current.begin());

    expect(result.current.choices?.map((w) => w.id)).toEqual(["io.rabby", "io.metamask"]);
  });

  it("forwards the chosen rdns and closes", () => {
    const connect = vi.spyOn(eip1193Store, "connect").mockResolvedValue();
    announceBoth();
    const { result } = renderHook(() => useConnectFlow());

    act(() => result.current.begin());
    const rabby: WalletChoice = { kind: "eip1193", id: "io.rabby", name: "Rabby", icon: "" };
    act(() => result.current.choose(rabby));

    // The whole point: MetaMask wins `pick()`'s tiebreak, so anything short of
    // naming Rabby here attaches the wrong wallet.
    expect(connect).toHaveBeenCalledWith("io.rabby");
    expect(result.current.choices).toBeNull();
  });

  // Which row leads is a security property, not a cosmetic one: the passkey is
  // the only offering an origin that merely *looks* like this one cannot use,
  // because WebAuthn binds the credential to `rp.id`. The EIP-712 row derives the
  // spending key from a signature over a public constant, which any site can ask
  // for. See `preferPasskey`.
  describe("ordering between the passkey and the extensions", () => {
    /// Make `passkeysAvailable()` true, so the passkey kind offers a row at all.
    const withPasskeySupport = () => stubWebAuthn();

    const idsAfterBegin = () => {
      const { result } = renderHook(() => useConnectFlow());
      act(() => result.current.begin());
      return result.current.choices?.map((w) => w.id);
    };

    it("leads with the passkey for a user who has chosen nothing yet", () => {
      withPasskeySupport();
      announce(detail("uuid-mm", "io.metamask"));

      expect(idsAfterBegin()).toEqual(["passkey", "io.metamask"]);
    });

    it("leads with the passkey once one is enrolled on this device", () => {
      withPasskeySupport();
      localStorage.setItem("lelantos:wallet:preferred-rdns", "io.metamask");
      localStorage.setItem("lelantos:passkey:v1:credential", JSON.stringify({ id: "cred-1" }));
      announce(detail("uuid-mm", "io.metamask"));

      expect(idsAfterBegin()).toEqual(["passkey", "io.metamask"]);
    });

    // A returning extension user has already answered this question. Reordering
    // under them would cost more than promoting the safer path gains, and the
    // remembered-wallet ordering above still has to hold.
    it("leaves a remembered extension in front", () => {
      withPasskeySupport();
      localStorage.setItem("lelantos:wallet:preferred-rdns", "io.rabby");
      announceBoth();

      expect(idsAfterBegin()).toEqual(["io.rabby", "io.metamask", "passkey"]);
    });

    // The adapter withholds its own row when the device cannot run the ceremony,
    // so there is nothing to promote and nothing to check twice.
    it("offers no passkey row at all without support", () => {
      announceBoth();

      expect(idsAfterBegin()).toEqual(["io.metamask", "io.rabby"]);
    });
  });

  it("cancel closes without disconnecting", () => {
    // Nothing was attached, so a disconnect here would clear the stored rdns
    // and cost the user their remembered wallet for dismissing a modal.
    const disconnect = vi.spyOn(eip1193Store, "disconnect");
    announceBoth();
    const { result } = renderHook(() => useConnectFlow());

    act(() => result.current.begin());
    act(() => result.current.cancel());

    expect(result.current.choices).toBeNull();
    expect(disconnect).not.toHaveBeenCalled();
  });
});
