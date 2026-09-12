import { describe, expect, it, vi } from "vitest";
import { attachProviderEvents, type Eip1193Provider, firstAccount } from "./provider";

describe("firstAccount", () => {
  // Wallets report checksummed addresses; the store compares lowercase.
  it("takes the first account, lowercased", () => {
    expect(firstAccount(["0xAbCd", "0xEeEe"])).toBe("0xabcd");
  });

  it("is undefined when the wallet authorised no account", () => {
    expect(firstAccount([])).toBeUndefined();
    expect(firstAccount([""])).toBeUndefined();
  });

  it("is undefined for a payload that is not a list", () => {
    expect(firstAccount(undefined)).toBeUndefined();
    expect(firstAccount("0xabcd")).toBeUndefined();
  });
});

describe("attachProviderEvents", () => {
  function eventful() {
    const handlers = new Map<string, (payload?: unknown) => void>();
    const provider = {
      request: vi.fn(),
      on: vi.fn((event: string, fn: (payload?: unknown) => void) => handlers.set(event, fn)),
      removeListener: vi.fn((event: string) => handlers.delete(event)),
    };
    return { provider: provider as Eip1193Provider, handlers };
  }

  it("translates wallet events into the store's terms", () => {
    const { provider, handlers } = eventful();
    const events = { onAccount: vi.fn(), onChain: vi.fn(), onDisconnect: vi.fn() };
    attachProviderEvents(provider, events);

    handlers.get("accountsChanged")?.(["0xABCD"]);
    handlers.get("chainChanged")?.("0x2105");
    expect(events.onAccount).toHaveBeenCalledWith("0xabcd");
    expect(events.onChain).toHaveBeenCalledWith(8453);

    // Losing every account is a disconnect, not an account change.
    handlers.get("accountsChanged")?.([]);
    handlers.get("disconnect")?.();
    expect(events.onDisconnect).toHaveBeenCalledTimes(2);
  });

  it("ignores a chain id it cannot parse", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { provider, handlers } = eventful();
    const events = { onAccount: vi.fn(), onChain: vi.fn(), onDisconnect: vi.fn() };
    attachProviderEvents(provider, events);

    handlers.get("chainChanged")?.("not-a-chain");
    expect(events.onChain).not.toHaveBeenCalled();
  });

  it("detaches every listener it attached", () => {
    const { provider, handlers } = eventful();
    const detach = attachProviderEvents(provider, {
      onAccount: vi.fn(),
      onChain: vi.fn(),
      onDisconnect: vi.fn(),
    });
    expect(handlers.size).toBe(3);
    detach();
    expect(handlers.size).toBe(0);
  });

  it("connects a provider that implements only `request`", () => {
    const detach = attachProviderEvents(
      { request: vi.fn() },
      { onAccount: vi.fn(), onChain: vi.fn(), onDisconnect: vi.fn() },
    );
    expect(() => detach()).not.toThrow();
  });
});
