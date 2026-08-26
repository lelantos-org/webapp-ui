// The branch that decides whether the user is asked at all, and that a named
// wallet reaches the store as a name. Before the picker existed every connect
// was `connect(undefined)`, which is exactly the case these pin down.

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { walletStore } from "@/features/eip1193";
import { announce, detail } from "@/test/eip6963";
import { useConnectFlow } from "./use-connect-flow";

describe("useConnectFlow", () => {
  beforeEach(() => {
    // Module singleton: without this each case inherits the previous one's
    // `discovered` list and the length branch below is decided by file order.
    walletStore.resetForTest();
    walletStore.startDiscovery();
    localStorage.clear();
  });

  it("connects straight away when there is nothing to choose between", () => {
    const connect = vi.spyOn(walletStore, "connect").mockResolvedValue();
    const { result } = renderHook(() => useConnectFlow());

    act(() => result.current.begin());
    expect(connect).toHaveBeenCalledWith();

    announce(detail("uuid-mm", "io.metamask"));
    act(() => result.current.begin());

    // Zero and one are the same branch: `connect()` waits out the announce
    // window itself and reports "no wallet detected" if it stays empty.
    expect(connect).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenLastCalledWith();
    expect(result.current.choices).toBeNull();
  });

  it("opens the picker once a second wallet has announced", () => {
    const connect = vi.spyOn(walletStore, "connect").mockResolvedValue();
    announce(detail("uuid-mm", "io.metamask"));
    announce(detail("uuid-rb", "io.rabby"));
    const { result } = renderHook(() => useConnectFlow());

    act(() => result.current.begin());

    expect(connect).not.toHaveBeenCalled();
    expect(result.current.choices?.map((w) => w.info.rdns)).toEqual(["io.metamask", "io.rabby"]);
  });

  it("puts the remembered wallet first", () => {
    localStorage.setItem("lelantos:wallet:preferred-rdns", "io.rabby");
    announce(detail("uuid-mm", "io.metamask"));
    announce(detail("uuid-rb", "io.rabby"));
    const { result } = renderHook(() => useConnectFlow());

    act(() => result.current.begin());

    expect(result.current.choices?.map((w) => w.info.rdns)).toEqual(["io.rabby", "io.metamask"]);
  });

  it("forwards the chosen rdns and closes", () => {
    const connect = vi.spyOn(walletStore, "connect").mockResolvedValue();
    announce(detail("uuid-mm", "io.metamask"));
    announce(detail("uuid-rb", "io.rabby"));
    const { result } = renderHook(() => useConnectFlow());

    act(() => result.current.begin());
    act(() => result.current.choose("io.rabby"));

    // The whole point: MetaMask wins `pick()`'s tiebreak, so anything short of
    // naming Rabby here attaches the wrong wallet.
    expect(connect).toHaveBeenCalledWith("io.rabby");
    expect(result.current.choices).toBeNull();
  });

  it("cancel closes without disconnecting", () => {
    // Nothing was attached, so a disconnect here would clear the stored rdns
    // and cost the user their remembered wallet for dismissing a modal.
    const disconnect = vi.spyOn(walletStore, "disconnect");
    announce(detail("uuid-mm", "io.metamask"));
    announce(detail("uuid-rb", "io.rabby"));
    const { result } = renderHook(() => useConnectFlow());

    act(() => result.current.begin());
    act(() => result.current.cancel());

    expect(result.current.choices).toBeNull();
    expect(disconnect).not.toHaveBeenCalled();
  });
});
