import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eip1193Store } from "@/features/wallet-kinds";
import { stubWebAuthn } from "@/test/browser";
import { announce, detail } from "@/test/fakes/eip6963";
import { useConnectFlow } from "./use-connect-flow";
import type { WalletChoice } from "./wallet-offerings";

function announceBoth() {
  announce(detail("uuid-mm", "io.metamask"));
  announce(detail("uuid-rb", "io.rabby"));
}

describe("useConnectFlow", () => {
  beforeEach(() => {
    eip1193Store.resetForTest();
    eip1193Store.startDiscovery();
    localStorage.clear();
    vi.stubGlobal("isSecureContext", false);
  });

  it("connects straight away when there is nothing to choose between", () => {
    const connect = vi.spyOn(eip1193Store, "connect").mockResolvedValue();
    const { result } = renderHook(() => useConnectFlow());

    act(() => result.current.begin());
    expect(connect).toHaveBeenCalledWith(undefined);

    announce(detail("uuid-mm", "io.metamask"));
    act(() => result.current.begin());

    expect(connect).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenLastCalledWith(undefined);
    expect(result.current.choices).toBeNull();
  });

  it("detaches the injected wallet when a passkey is chosen", () => {
    // The pick must beat `WALLET_KINDS` priority, which the injected kind otherwise wins.
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

    expect(connect).toHaveBeenCalledWith("io.rabby");
    expect(result.current.choices).toBeNull();
  });

  // Security property: only the passkey is phishing-resistant (see `preferPasskey`).
  describe("ordering between the passkey and the extensions", () => {
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

    it("leaves a remembered extension in front", () => {
      withPasskeySupport();
      localStorage.setItem("lelantos:wallet:preferred-rdns", "io.rabby");
      announceBoth();

      expect(idsAfterBegin()).toEqual(["io.rabby", "io.metamask", "passkey"]);
    });

    it("offers no passkey row at all without support", () => {
      announceBoth();

      expect(idsAfterBegin()).toEqual(["io.metamask", "io.rabby"]);
    });
  });

  it("cancel closes without disconnecting", () => {
    const disconnect = vi.spyOn(eip1193Store, "disconnect");
    announceBoth();
    const { result } = renderHook(() => useConnectFlow());

    act(() => result.current.begin());
    act(() => result.current.cancel());

    expect(result.current.choices).toBeNull();
    expect(disconnect).not.toHaveBeenCalled();
  });
});
