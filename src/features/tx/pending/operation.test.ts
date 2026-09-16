import { describe, expect, it } from "vitest";
import { operationOf, pendingOpOf } from "./operation";

describe("pendingOpOf", () => {
  it("names an operation by its first commitment", () => {
    expect(pendingOpOf({ txHash: "0xtx", commitments: ["0xa", "0xb"] })).toEqual({
      txHash: "0xtx",
      opId: "0xa",
    });
  });
});

describe("operationOf", () => {
  it("is 1-based, and names the operation by its first commitment", () => {
    expect(
      operationOf({
        txHash: "0xtx",
        commitments: ["0xa", "0xb"],
        operation: { index: 0, count: 2 },
      }),
    ).toEqual({ index: 1, count: 2, commitment: "0xa" });
  });

  it("stays silent for a lone, unlocated or absent operation", () => {
    expect(
      operationOf({ txHash: "0xtx", commitments: ["0xa"], operation: { index: 0, count: 1 } }),
    ).toBeUndefined();
    expect(operationOf({ txHash: "0xtx", commitments: ["0xa"] })).toBeUndefined();
    expect(operationOf(undefined)).toBeUndefined();
  });
});
