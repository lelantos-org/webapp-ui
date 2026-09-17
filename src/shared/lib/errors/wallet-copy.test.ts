import {
  assetId,
  ChainRpcError,
  circuitAmount,
  DeadlinePassedError,
  FeeAssetNotQuotedError,
  InsufficientBalanceError,
  InsufficientCoverError,
  InvalidArgumentError,
  NetworkError,
  NoEvmAccountError,
  NotesHeldError,
  ProverError,
  ProverUnavailableError,
  QuoteStaleError,
  RelayerRejectedError,
  type RelayerRejectReason,
  SpendOutcomeUnknownError,
  TreeOutOfSyncError,
  TxMiningError,
  TxRevertedError,
  UnsupportedOperationError,
  UserRejectedError,
  WalletConfigError,
} from "@lelantos-org/sdk";
import { describe, expect, it } from "vitest";
import { isDuplicateSpend, walletErrorText } from "./wallet-copy";

const rejected = (reason: RelayerRejectReason, status = 409) =>
  new RelayerRejectedError({ status, reason, body: `${reason}: chain 1` });

const bucket = (value: bigint, count: number) => ({ value: circuitAmount(value), count });

const held = (h: { reserved?: number; cooldown?: number; dust?: number }) =>
  new NotesHeldError({
    asset: assetId(1n),
    required: circuitAmount(100n),
    spendable: circuitAmount(0n),
    held: {
      reserved: bucket(h.reserved ? 200n : 0n, h.reserved ?? 0),
      cooldown: bucket(h.cooldown ? 200n : 0n, h.cooldown ?? 0),
      dust: bucket(h.dust ? 200n : 0n, h.dust ?? 0),
    },
  });

const cover = (args: {
  consolidate?: number;
  consolidationAttempted?: boolean;
  reason?: "arity" | "fee-slot";
}) =>
  new InsufficientCoverError({
    target: circuitAmount(100n),
    asset: assetId(1n),
    consolidate: Array.from({ length: args.consolidate ?? 0 }, (_, i) => ({
      id: String(i),
      value: "10",
    })),
    consolidateSum: circuitAmount(10n * BigInt(args.consolidate ?? 0)),
    consolidationAttempted: args.consolidationAttempted,
    reason: args.reason,
  });

describe("walletErrorText", () => {
  it.each([
    [new NetworkError("RELAYER_TIMEOUT", "/r", "x"), /Relayer timed out/],
    [
      new NetworkError("RELAYER_FAILED", "/r", "HTTP 500", { status: 500 }),
      /relayer couldn't process/,
    ],
    [new NetworkError("FMD_TIMEOUT", "/f", "x"), /FMD\) timed out/],
    [new NetworkError("FMD_FAILED", "/f", "x"), /FMD\) request failed/],
    [new ProverError("x"), /Proof generation failed/],
    [new ProverUnavailableError("snarkjs missing"), /Proving isn't available/],
    [new UserRejectedError("sign-permit"), /Signature rejected/],
    [new UserRejectedError("send-tx"), /Transaction rejected/],
    [new WalletConfigError("missing rpcUrl"), /Wallet misconfigured/],
    [
      new UnsupportedOperationError("deposit:native", ["submitIntentNative"]),
      /Wallet adapter cannot satisfy/,
    ],
    [new TxMiningError("no receipt"), /Transaction did not mine/],
    [new TxRevertedError("0xabc", "reverted"), /reverted on-chain/],
    [new ChainRpcError("fetchAsset"), /Couldn't reach the network/],
    [new TreeOutOfSyncError({ localRoot: 1n, mirrorRoot: 2n }), /out of sync.*resync/],
    [new QuoteStaleError({ fields: ["net"] }), /Prices moved.*refreshed/],
    [new DeadlinePassedError(0n), /expired.*Refresh/],
    [new NoEvmAccountError(), /^Connect an EVM wallet to deposit\.$/],
    [new NoEvmAccountError({ operation: "cancelDeposit" }), /to cancel a deposit/],
    [
      new InsufficientBalanceError({
        asset: assetId(1n),
        available: circuitAmount(0n),
        required: circuitAmount(1n),
      }),
      /^Insufficient balance for this amount\.$/,
    ],
  ])("maps %s", (err, re) => {
    expect(walletErrorText(err)).toEqual({ text: expect.stringMatching(re), curated: true });
  });
});

describe("insufficient cover", () => {
  it("names the notes to consolidate", () => {
    const msg = walletErrorText(cover({ consolidate: 2 })).text;
    expect(msg).toMatch(/Insufficient cover/);
    expect(msg).toMatch(/Consolidate 2 smallest notes/);
  });

  it("stops suggesting consolidation once it has run", () => {
    const msg = walletErrorText(cover({ consolidate: 2, consolidationAttempted: true })).text;
    expect(msg).toMatch(/Merging notes didn't free up enough/);
  });

  it("points a fee with no slot left at the asset being sent", () => {
    expect(walletErrorText(cover({ consolidate: 2, reason: "fee-slot" })).text).toMatch(
      /Pay the relayer in the asset you're sending/,
    );
  });

  it("asks for a top-up when there is nothing to consolidate", () => {
    expect(walletErrorText(cover({})).text).toMatch(/Top up/);
  });
});

describe("notes held back", () => {
  it("reads notes tied up in an earlier spend as a wait, not as an empty wallet", () => {
    const err = held({ reserved: 2 });
    expect(err.retryable).toBe(true);
    expect(walletErrorText(err).text).toMatch(/2 notes are still tied up in an earlier spend/);
  });

  it("reads notes still cooling down as a short wait", () => {
    expect(walletErrorText(held({ cooldown: 1 })).text).toMatch(/aren't spendable yet/);
  });

  it("does not promise a wait will release dust", () => {
    const err = held({ dust: 3 });
    expect(err.retryable).toBe(false);
    expect(walletErrorText(err).text).toMatch(/too small to spend/);
  });
});

describe("fee asset the relayer does not quote", () => {
  it("names the fee token rather than reading as a retryable rejection", () => {
    const err = new FeeAssetNotQuotedError({
      asset: assetId(2n),
      kind: "deposit",
      accepted: [assetId(1n)],
    });
    expect(walletErrorText(err).text).toBe(
      "The relayer doesn't take that token for its fee. Pay it in another token.",
    );
  });

  it("does not suggest another token when none is quoted", () => {
    const err = new FeeAssetNotQuotedError({ asset: assetId(2n), accepted: [] });
    expect(walletErrorText(err).text).not.toMatch(/another token/);
  });
});

describe("spend with an unknown outcome", () => {
  it("says the notes are reserved and to check before retrying", () => {
    const err = new SpendOutcomeUnknownError({
      reservedNoteIds: ["1"],
      reservedUntil: new Date(2026, 0, 1, 12, 30),
    });
    const { text, curated } = walletErrorText(err);
    expect(curated).toBe(true);
    expect(text).toMatch(/outcome is unknown/);
    expect(text).toMatch(/reserved until .*30/);
    expect(text).toMatch(/check the explorer, or wait before retrying/);
  });
});

describe("deposit fee asset", () => {
  it("words the SDK's refusal of a fee asset, which names bare ids", () => {
    const refused = new InvalidArgumentError("asset 3 earns yield, so it can pay …", {
      argument: "feeAsset",
    });
    expect(walletErrorText(refused)).toEqual({
      text: expect.stringMatching(/can't pay the relayer fee for this deposit/),
      curated: true,
    });
  });

  it("passes any other invalid argument through", () => {
    const other = new InvalidArgumentError("deposit amount must be positive", {
      argument: "amount",
    });
    expect(walletErrorText(other)).toEqual({
      text: "deposit amount must be positive",
      curated: false,
    });
  });
});

describe("duplicate spend", () => {
  it("tells a spend still in flight apart from one already landed", () => {
    expect(walletErrorText(rejected("nullifier-in-flight")).text).toMatch(/Wait for it/);
    expect(walletErrorText(rejected("nullifier-spent")).text).toMatch(/already spent/);
  });

  it("reads the reason, not the relayer's text", () => {
    const err = new RelayerRejectedError({
      status: 409,
      reason: "nullifier-spent",
      body: "nullifier in flight: chain 1",
    });
    expect(walletErrorText(err).text).toMatch(/already spent/);
  });

  it("is a duplicate spend for both nullifier reasons", () => {
    expect(isDuplicateSpend(rejected("nullifier-in-flight"))).toBe(true);
    expect(isDuplicateSpend(rejected("nullifier-spent"))).toBe(true);
  });

  it("is not a duplicate spend for any other refusal", () => {
    const fee = rejected("fee-too-low", 402);
    expect(isDuplicateSpend(fee)).toBe(false);
    expect(walletErrorText(fee).text).toMatch(/Relayer rejected/);
    expect(isDuplicateSpend(rejected("stale-estimate"))).toBe(false);
    expect(
      isDuplicateSpend(
        new NetworkError("RELAYER_FAILED", "/r", "HTTP 409", { status: 409, body: "boom" }),
      ),
    ).toBe(false);
    expect(isDuplicateSpend(new Error("HTTP 409"))).toBe(false);
  });

  it("suggests a retry only when the refusal can clear up", () => {
    expect(walletErrorText(rejected("internal", 500)).text).toMatch(/Retry shortly/);
    expect(walletErrorText(rejected("bad-request", 400)).text).toMatch(/Check the relayer logs/);
  });
});
