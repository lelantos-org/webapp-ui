import { describe, expect, it } from "vitest";
import { queryKeys } from "./keys";

const CHAIN = 31337n;
const ME = "0xabc";

describe("queryKeys", () => {
  it("spells every key as its query has always used it", () => {
    expect(queryKeys.chainRegistry()).toEqual(["chain-registry"]);
    expect(queryKeys.prices()).toEqual(["asset-prices"]);
    expect(queryKeys.systemHealth()).toEqual(["system-health"]);
    expect(queryKeys.syncHead(CHAIN)).toEqual(["sync-head", "31337"]);
    expect(queryKeys.syncHead()).toEqual(["sync-head", null]);
    expect(queryKeys.walletState(CHAIN, ME)).toEqual(["wallet-state", "31337", ME]);
    expect(queryKeys.feePreview(CHAIN, "deposit", 1n, 5n)).toEqual([
      "fee-preview",
      "31337",
      "deposit",
      "1",
      "5",
    ]);
    expect(queryKeys.feeBps(CHAIN, undefined, "withdraw")).toEqual([
      "fee-bps",
      "31337",
      null,
      "withdraw",
    ]);
    expect(
      queryKeys.spendableMax(CHAIN, ME, 2n, "3:9", {
        kind: "withdraw",
        feeAsset: 5n,
        native: true,
        quotedFee: 4n,
      }),
    ).toEqual(["spendable-max", "31337", ME, "2", "3:9", "withdraw", "5", true, "4"]);
    expect(queryKeys.yieldIndex(CHAIN)).toEqual(["yield-index", "31337"]);
    expect(queryKeys.swapQuote("none")).toEqual(["swap-quote", "none"]);
    expect(queryKeys.assetLadder(CHAIN, 1n)).toEqual(["asset-ladder", "31337", "1"]);
  });

  it("builds member keys on their family prefix", () => {
    expect(queryKeys.feeQuote(CHAIN, ME)).toEqual(["fee-quote", "31337", ME]);
    expect(queryKeys.feeQuote(CHAIN, ME, "swap")).toEqual(["fee-quote", "31337", ME, "swap"]);

    expect(queryKeys.transparentBalances(undefined, undefined)).toEqual([
      "transparent-balances",
      null,
      null,
    ]);
    expect(queryKeys.sourceBalance(CHAIN, ME, 7n, false)).toEqual([
      "transparent-balances",
      "31337",
      ME,
      "7",
    ]);
    expect(queryKeys.sourceBalance(CHAIN, ME, 7n, true)).toEqual([
      "transparent-balances",
      "31337",
      ME,
      "native",
    ]);

    expect(queryKeys.setupStatus(CHAIN, ME, "0xToKeN")).toEqual([
      "permit2-setup-status",
      "31337",
      ME,
      "0xtoken",
    ]);
    expect(queryKeys.setupStatus(CHAIN, ME)).toEqual(["permit2-setup-status", "31337", ME, null]);
    expect(queryKeys.setupStatusOf(CHAIN, ME)).toEqual(["permit2-setup-status", "31337", ME]);

    const gov = queryKeys.governance(CHAIN);
    expect(gov).toEqual(["governance", "31337"]);
    for (const member of [
      queryKeys.governanceProposals(CHAIN),
      queryKeys.governanceProposalStates(CHAIN, "7,8"),
      queryKeys.governanceProposal(CHAIN, "7"),
      queryKeys.governanceProposalChain(CHAIN, "7", ME),
      queryKeys.governanceVotes(CHAIN, "7"),
      queryKeys.governanceClock(CHAIN),
      queryKeys.governanceVotingPower(CHAIN, ME),
    ]) {
      expect(member.slice(0, gov.length)).toEqual(gov);
    }
    expect(queryKeys.governanceProposalChain(CHAIN, "7", undefined)).toEqual([
      "governance",
      "31337",
      "proposal-chain",
      "7",
      null,
    ]);
  });
});
