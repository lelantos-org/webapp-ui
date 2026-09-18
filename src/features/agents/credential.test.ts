import { describe, expect, it } from "vitest";
import { render } from "./credential";
import type { StoredAgent } from "./record";

const AGENT: StoredAgent = {
  id: "a1",
  label: "research bot",
  chainId: "31337",
  address: "lelantos1example",
  nsk: "0xdeadbeef",
  createdAt: 0,
};

describe("credential", () => {
  it("renders the three fields an agent needs to connect", () => {
    // `connect({ nsk, network, rpcUrl })` is what the agent runs, so the chain
    // and the key are the credential; the address is what gets topped up.
    const json = JSON.parse(render(AGENT, "json", { reveal: true }));
    expect(json).toEqual({
      chainId: "31337",
      address: "lelantos1example",
      nsk: "0xdeadbeef",
    });
  });

  it("renders an env block naming the same values", () => {
    const env = render(AGENT, "env", { reveal: true });
    expect(env).toContain("LELANTOS_CHAIN_ID=31337");
    expect(env).toContain("LELANTOS_NSK=0xdeadbeef");
    expect(env).toContain("LELANTOS_ADDRESS=lelantos1example");
  });

  it("masks the key unless asked for", () => {
    // The panel appears the moment an agent is funded, which is exactly when
    // someone may be looking at the screen.
    for (const format of ["json", "env"] as const) {
      expect(render(AGENT, format)).not.toContain("0xdeadbeef");
    }
  });

  it("masks without leaking a fragment of the key", () => {
    // Not a truncation: a few leading hex characters are still a few characters
    // of a spending key.
    const masked = render(AGENT, "json");
    for (const fragment of ["0xdead", "dead", "beef"]) {
      expect(masked).not.toContain(fragment);
    }
  });

  it("still shows what is not secret while masked", () => {
    // The address is how an operator tells one agent from another, and it is
    // public anyway.
    const masked = JSON.parse(render(AGENT, "json"));
    expect(masked.address).toBe("lelantos1example");
    expect(masked.chainId).toBe("31337");
  });

  it("keeps the masked form valid JSON, so the panel never renders a broken blob", () => {
    expect(() => JSON.parse(render(AGENT, "json"))).not.toThrow();
  });

  it("warns, in the env block, what the key can do", () => {
    expect(render(AGENT, "env", { reveal: true })).toContain("can spend everything");
  });

  it("leaves the label out of the machine-readable form", () => {
    // It is the operator's word for it, not something the agent should key off.
    expect(render(AGENT, "json", { reveal: true })).not.toContain("research bot");
  });
});
