import type { EvmAddress, WalletApi } from "@lelantos-org/sdk";
import { describe, expect, it } from "vitest";
import { ensurePermit2AuthorizedSetupBatch, type SetupProgress } from "./permit2";

const OWNER = `0x${"aa".repeat(20)}` as EvmAddress;
const MASP = `0x${"bb".repeat(20)}` as EvmAddress;
const PERMIT2 = `0x${"cc".repeat(20)}` as EvmAddress;
const TOK_A = `0x${"11".repeat(20)}` as EvmAddress;
const TOK_B = `0x${"22".repeat(20)}` as EvmAddress;
const TOK_C = `0x${"33".repeat(20)}` as EvmAddress;

const CAP = (1n << 160n) - 1n;
const EXPIRY = 1_900_000_000;

/// Per-token knobs: how much this token has already approved to Permit2, and
/// what nonce Permit2 reports for it.
interface TokenState {
  erc20Allowance: bigint;
  nonce: number;
}

/// Shape `signPermit2AllowanceBatch` receives; mirrors the SDK's `PermitBatch`.
interface PermitBatchArg {
  details: { token: string; amount: bigint; expiration: number; nonce: number }[];
  spender: string;
  sigDeadline: bigint;
}

/// Mirrors `ViemChainAdapter`: prototype methods that read `this.ctx`.
///
/// A plain object of `vi.fn()`s would not do. The adapter's methods are on the
/// prototype and dereference `this`, so a caller that pulls one off the object
/// — `const { tokenApprove } = chain` — gets an unbound function that throws
/// "Cannot read properties of undefined (reading 'ctx')" at runtime while
/// typechecking cleanly. Only a `this`-dependent mock reproduces that.
class MockChain {
  readonly ctx: {
    state: Record<string, TokenState>;
    approved: EvmAddress[];
    signed: PermitBatchArg[];
    submitted: number;
  };

  constructor(state: Record<string, TokenState>) {
    this.ctx = { state, approved: [], signed: [], submitted: 0 };
  }

  // Present only so `supportsAllowanceBatch` accepts this adapter.
  submitDepositAuthorized() {}
  permit2PermitAllowance() {}
  signPermit2Allowance() {}

  permit2Address(): EvmAddress {
    return PERMIT2;
  }
  async payerAddress(): Promise<EvmAddress> {
    return OWNER;
  }
  async maspAddress(): Promise<EvmAddress> {
    return MASP;
  }
  async tokenAllowance(token: EvmAddress): Promise<bigint> {
    return this.ctx.state[token]!.erc20Allowance;
  }
  async tokenApprove(
    token: EvmAddress,
    _spender: EvmAddress,
    _amount: bigint,
    onTxHash?: (h: string) => void,
  ): Promise<{ txHash: string }> {
    this.ctx.approved.push(token);
    onTxHash?.("0xhash");
    return { txHash: "0xhash" };
  }
  async permit2Allowance(token: EvmAddress) {
    return { amount: 0n, expiration: 0, nonce: this.ctx.state[token]!.nonce };
  }
  async signPermit2AllowanceBatch(permit: PermitBatchArg): Promise<{ signature: string }> {
    this.ctx.signed.push(permit);
    return { signature: "0xsig" };
  }
  async permit2PermitAllowanceBatch(): Promise<{ txHash: string }> {
    this.ctx.submitted += 1;
    return { txHash: "0xpermit" };
  }
}

function mockWallet(state: Record<string, TokenState>) {
  const chain = new MockChain(state);
  return { wallet: { chain } as unknown as WalletApi, chain };
}

const entry = (token: EvmAddress) => ({ token, cap: CAP, expirationUnixSecs: EXPIRY });

describe("ensurePermit2AuthorizedSetupBatch", () => {
  // The whole point of the batch: steps 2 and 3 stop scaling with N.
  it("signs once and submits one permit tx regardless of token count", async () => {
    const m = mockWallet({
      [TOK_A]: { erc20Allowance: 0n, nonce: 7 },
      [TOK_B]: { erc20Allowance: 0n, nonce: 0 },
      [TOK_C]: { erc20Allowance: 0n, nonce: 3 },
    });
    await ensurePermit2AuthorizedSetupBatch(m.wallet, [entry(TOK_A), entry(TOK_B), entry(TOK_C)]);

    expect(m.chain.ctx.signed).toHaveLength(1);
    expect(m.chain.ctx.submitted).toBe(1);
    // Step 1 does not batch — one approval tx per token.
    expect(m.chain.ctx.approved).toEqual([TOK_A, TOK_B, TOK_C]);
  });

  // Permit2 keys nonces by (owner, token, spender) and reverts the whole batch
  // on one stale entry, so a shared value would verify locally and fail on chain.
  it("gives each entry its own nonce, in order", async () => {
    const m = mockWallet({
      [TOK_A]: { erc20Allowance: CAP, nonce: 7 },
      [TOK_B]: { erc20Allowance: CAP, nonce: 0 },
    });
    await ensurePermit2AuthorizedSetupBatch(m.wallet, [entry(TOK_A), entry(TOK_B)]);

    const permit = m.chain.ctx.signed[0]!;
    expect(permit.details.map((d) => [d.token, d.nonce])).toEqual([
      [TOK_A, 7],
      [TOK_B, 0],
    ]);
    expect(permit.spender).toBe(MASP);
    expect(permit.details.every((d) => d.amount === CAP && d.expiration === EXPIRY)).toBe(true);
  });

  it("skips the approval for tokens Permit2 can already pull", async () => {
    const m = mockWallet({
      [TOK_A]: { erc20Allowance: CAP, nonce: 1 },
      [TOK_B]: { erc20Allowance: 0n, nonce: 2 },
    });
    await ensurePermit2AuthorizedSetupBatch(m.wallet, [entry(TOK_A), entry(TOK_B)]);

    expect(m.chain.ctx.approved).toEqual([TOK_B]);
    // Both still get a window — a skipped approval is not a skipped entry.
    expect(m.chain.ctx.signed[0]!.details).toHaveLength(2);
  });

  it("numbers approval progress over the tokens that need it, not all of them", async () => {
    const m = mockWallet({
      [TOK_A]: { erc20Allowance: CAP, nonce: 1 },
      [TOK_B]: { erc20Allowance: 0n, nonce: 2 },
      [TOK_C]: { erc20Allowance: 0n, nonce: 3 },
    });
    const seen: SetupProgress[] = [];
    await ensurePermit2AuthorizedSetupBatch(
      m.wallet,
      [entry(TOK_A), entry(TOK_B), entry(TOK_C)],
      (p) => seen.push(p),
    );

    const approving = seen.filter(
      (p) => p.step === "approving" && p.status === "wallet",
    ) as Extract<SetupProgress, { step: "approving" }>[];
    expect(approving.map((p) => [p.token, p.index, p.total])).toEqual([
      [TOK_B, 1, 2],
      [TOK_C, 2, 2],
    ]);
    expect(seen.filter((p) => p.step === "signing")).toHaveLength(1);
    expect(seen.filter((p) => p.step === "permitting" && p.status === "wallet")).toHaveLength(1);
  });

  it("does nothing on an empty selection", async () => {
    const m = mockWallet({});
    await ensurePermit2AuthorizedSetupBatch(m.wallet, []);
    expect(m.chain.ctx.signed).toHaveLength(0);
    expect(m.chain.ctx.submitted).toBe(0);
  });

  it("rejects an adapter without the batch methods", async () => {
    const m = mockWallet({ [TOK_A]: { erc20Allowance: 0n, nonce: 0 } });
    // Mirrors an adapter that simply does not implement the batch methods.
    (m.chain as unknown as Record<string, unknown>).signPermit2AllowanceBatch = undefined;
    await expect(ensurePermit2AuthorizedSetupBatch(m.wallet, [entry(TOK_A)])).rejects.toThrow(
      /lacks Permit2 batch/,
    );
  });
});
