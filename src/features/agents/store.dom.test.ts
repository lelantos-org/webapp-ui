// The agent store holds long-lived spending keys. What is asserted here is the
// one property that separates it from the claim-link vault: nothing is dropped
// because time passed, because the stored key may be the only copy of something
// still holding funds.

import { beforeEach, describe, expect, it } from "vitest";
import { MAX_RECORDS } from "./policy";
import {
  agentsSnapshot,
  forgetAgent,
  markAgentCopied,
  markAgentRevoked,
  rememberAgent,
  resetForTest,
} from "./store";

const INPUT = {
  label: "research bot",
  chainId: 31337n,
  address: "lelantos1example",
  nsk: "0xabc123",
};

beforeEach(() => {
  localStorage.clear();
  resetForTest();
});

describe("agent store", () => {
  it("persists an agent and reads it back", () => {
    const id = rememberAgent(INPUT);
    const [stored] = agentsSnapshot();
    expect(stored?.id).toBe(id);
    expect(stored?.label).toBe("research bot");
    expect(stored?.chainId).toBe("31337");
    expect(stored?.nsk).toBe("0xabc123");
  });

  it("survives a reload", () => {
    rememberAgent(INPUT);
    resetForTest();
    expect(agentsSnapshot()).toHaveLength(1);
  });

  it("keeps an agent however old it is", () => {
    // A year ago. The claim-link vault would have dropped this; dropping it here
    // would strand whatever the agent still holds.
    const ancient = Date.now() - 365 * 24 * 60 * 60 * 1000;
    rememberAgent(INPUT, ancient);
    resetForTest();
    expect(agentsSnapshot()).toHaveLength(1);
  });

  it("orders newest first", () => {
    rememberAgent({ ...INPUT, label: "old" }, 1_000);
    rememberAgent({ ...INPUT, label: "new" }, 2_000);
    expect(agentsSnapshot().map((a) => a.label)).toEqual(["new", "old"]);
  });

  it("caps the list, keeping the newest", () => {
    for (let i = 0; i < MAX_RECORDS + 3; i += 1) {
      rememberAgent({ ...INPUT, label: `agent ${i}` }, 1_000 + i);
    }
    const stored = agentsSnapshot();
    expect(stored).toHaveLength(MAX_RECORDS);
    expect(stored[0]?.label).toBe(`agent ${MAX_RECORDS + 2}`);
  });

  it("marks a credential copied", () => {
    const id = rememberAgent(INPUT);
    markAgentCopied(id, 4_000);
    expect(agentsSnapshot()[0]?.copiedAt).toBe(4_000);
  });

  it("keeps a revoked agent, so it stays auditable", () => {
    const id = rememberAgent(INPUT);
    markAgentRevoked(id, 5_000);
    const [stored] = agentsSnapshot();
    expect(stored?.revokedAt).toBe(5_000);
    expect(stored?.nsk).toBe("0xabc123");
  });

  it("forgets a record outright", () => {
    const id = rememberAgent(INPUT);
    forgetAgent(id);
    expect(agentsSnapshot()).toHaveLength(0);
  });

  it("ignores a mark for an agent that is gone", () => {
    markAgentCopied("nope");
    markAgentRevoked("nope");
    expect(agentsSnapshot()).toHaveLength(0);
  });

  it("treats a malformed store as empty rather than throwing in render", () => {
    localStorage.setItem("lelantos:agents:v1", '[{"id":"x"}]');
    resetForTest();
    expect(agentsSnapshot()).toEqual([]);
  });
});
