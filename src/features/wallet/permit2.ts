// Helpers around the SDK's optional Permit2 chain methods. Predicate and action
// are split so a caller can decide whether to render an "approving" step before
// starting the transaction.

import {
  type EvmAddress,
  supportsAllowanceBatch,
  supportsAllowanceTransfer,
  tokenAmount,
  type WalletApi,
} from "@lelantos-org/sdk";

const MAX_UINT256 = tokenAmount((1n << 256n) - 1n);

/// True when the payer's allowance for `token` to Permit2 is below `total`.
/// False when the chain adapter lacks Permit2 helpers (non-EVM), where no
/// approval step applies.
export async function needsPermit2Approval(
  wallet: WalletApi,
  token: EvmAddress,
  total: bigint,
): Promise<boolean> {
  const chain = wallet.chain;
  if (!chain.tokenAllowance || !chain.tokenApprove || !chain.permit2Address) return false;
  const owner = await chain.payerAddress();
  const cur = await chain.tokenAllowance(token, owner, chain.permit2Address());
  return cur < total;
}

/// Send a `tokenApprove(MAX)` tx for `token` against Permit2. Callers must first
/// confirm the approval is needed via `needsPermit2Approval`.
export async function approvePermit2(wallet: WalletApi, token: EvmAddress): Promise<void> {
  const chain = wallet.chain;
  if (!chain.tokenApprove || !chain.permit2Address) {
    throw new Error("approvePermit2: chain adapter does not support Permit2");
  }
  await chain.tokenApprove(token, chain.permit2Address(), MAX_UINT256);
}

// ============================================================================
// AllowanceTransfer helpers — no per-deposit Permit2 signature needed.
// ============================================================================

/// `type(uint160).max`, the sentinel Permit2 reads as an unlimited allowance.
export const UNLIMITED_ALLOWANCE = (1n << 160n) - 1n;

/// Default allowance cap: unlimited, and independent of the deposit amount.
///
/// A cap sized from the current deposit re-triggers setup mid-session, since
/// `evaluateSetup` compares the window against the current total and any larger
/// deposit immediately outruns it.
///
/// Permit2 treats `type(uint160).max` as unlimited and non-decrementing —
/// `AllowanceTransfer._transfer` guards the subtraction with
/// `if (maxAmount != type(uint160).max)` — so the window never drains and
/// `expiration` is the only bound.
///
/// `MASP.depositAuthorized` is the sole spender of this allowance and reverts
/// `PayerNotSender` unless `msg.sender == d.payer`, so nothing moves without a
/// transaction the payer signed. Revisit if the pool gains a path that pulls the
/// allowance on another party's behalf.
export function defaultAllowanceCap(): bigint {
  return UNLIMITED_ALLOWANCE;
}

/// Default allowance expiry (unix seconds).
///
/// One year. With a non-draining cap this is the only thing that ends the grant,
/// so it stays finite rather than `type(uint48).max`, while being long enough to
/// avoid routine re-signing.
export function defaultAllowanceExpirationSecs(): number {
  return Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
}

/// Matches the SDK's `ALLOWANCE_BUFFER_SECS`, which applies the same rule.
export const SAFETY_BUFFER_SECS = 60;

/// Both allowances an AllowanceTransfer deposit depends on.
export interface Permit2AllowanceState {
  /// ERC-20 → Permit2, in token base units. Permit2 pulls through this, so a
  /// signed window has no effect without it.
  erc20Allowance: bigint;
  /// Permit2 → MASP window: the cap, its expiry, and the nonce to sign next.
  window: { amount: bigint; expiration: number; nonce: number };
}

/// Read both allowances for `token`, or `undefined` when this chain cannot
/// answer — no AllowanceTransfer support, or a registry row with no
/// `permit2Address` (the field is optional).
///
/// `undefined` rather than zeros. Zeros are a valid reading meaning nothing is
/// approved, which `evaluateSetup` treats as "setup required"; returning them
/// for a chain where setup cannot run would loop `SetupNotice` against a setup
/// that can never succeed.
///
/// Returns raw values rather than a verdict: these reads are per (payer, token)
/// while the deposit amount changes per keystroke, so the caller applies the
/// amount via `evaluateSetup`.
export async function readPermit2AllowanceState(
  wallet: WalletApi,
  token: EvmAddress,
): Promise<Permit2AllowanceState | undefined> {
  const chain = wallet.chain;
  if (!supportsAllowanceTransfer(chain) || !chain.permit2Address || !chain.tokenAllowance) {
    return undefined;
  }
  const owner = await chain.payerAddress();
  const masp = await chain.maspAddress();
  const [erc20Allowance, window] = await Promise.all([
    chain.tokenAllowance(token, owner, chain.permit2Address()),
    chain.permit2Allowance(token, owner, masp),
  ]);
  return { erc20Allowance, window };
}

export type SetupStep = "approving" | "signing" | "permitting";
/// Where a `SetupStep` currently is: awaiting the wallet prompt, or waiting on
/// the chain. Distinct from `onboarding/use-setup-status`'s `SetupStepPhase`,
/// which reports the allowance probe result.
export type SetupStepPhase = "wallet" | "confirming";

/// Where a batch setup currently is.
///
/// `approving` is the only repeating step — the ERC-20 approval is a method on
/// each token, so N tokens means N prompts — and the only variant carrying a
/// token. `signing` and `permitting` occur once per batch. Modelled as a union
/// so the distinction is enforced by the type.
export type SetupProgress =
  | {
      step: "approving";
      status: SetupStepPhase;
      txHash?: string;
      token: EvmAddress;
      /// 1-based position among the tokens that still need approving.
      index: number;
      total: number;
    }
  | { step: "signing" | "permitting"; status: SetupStepPhase; txHash?: string };

/// One token's terms in a batch setup.
export interface SetupEntry {
  token: EvmAddress;
  cap: bigint;
  expirationUnixSecs: number;
}

/// Outer EIP-712 deadline for the `permit()` call itself, distinct from each
/// entry's `expiration` (which gates the future pulls).
const SIG_DEADLINE_SECS = 30 * 60;

/// One-time-per-window setup letting future deposits pull via
/// `submitDepositAuthorized` with no per-tx Permit2 signature.
///
/// N tokens cost N approval txs but only one signature and one permit tx, since
/// `IAllowanceTransfer.permit` has a `PermitBatch` overload that collapses steps
/// 2 and 3. Step 1 cannot collapse: `approve` lives on each ERC-20 and Permit2
/// is not in that call path.
///
/// `onProgress` fires `wallet` before each sub-step (awaiting the wallet prompt),
/// then `confirming` with the broadcast tx hash for the on-chain steps.
export async function ensurePermit2AuthorizedSetupBatch(
  wallet: WalletApi,
  entries: readonly SetupEntry[],
  onProgress?: (p: SetupProgress) => void,
): Promise<void> {
  if (entries.length === 0) return;

  const chain = wallet.chain;
  if (
    !supportsAllowanceBatch(chain) ||
    !chain.permit2Address ||
    !chain.tokenApprove ||
    !chain.tokenAllowance
  ) {
    throw new Error(
      "ensurePermit2AuthorizedSetupBatch: chain adapter lacks Permit2 batch AllowanceTransfer methods",
    );
  }
  // Bound rather than destructured: these are prototype methods on
  // `ViemChainAdapter` that read `this.ctx`, so detaching them strips the
  // receiver and every call throws on `undefined`. Binding also carries the
  // narrowing from the guard above into the closures below.
  const tokenAllowance = chain.tokenAllowance.bind(chain);
  const tokenApprove = chain.tokenApprove.bind(chain);

  const owner = await chain.payerAddress();
  const masp = await chain.maspAddress();
  const permit2 = chain.permit2Address();

  // Pass 1 — ERC-20 → Permit2, one tx per token that needs it.
  const allowances = await Promise.all(entries.map((e) => tokenAllowance(e.token, owner, permit2)));
  const needApproval = entries.filter((e, i) => allowances[i]! < e.cap);
  for (const [i, entry] of needApproval.entries()) {
    const at = { token: entry.token, index: i + 1, total: needApproval.length };
    onProgress?.({ step: "approving", status: "wallet", ...at });
    // Sequential rather than `Promise.all`: wallets serialise prompts anyway,
    // and firing them together races the sender's nonce.
    await tokenApprove(entry.token, permit2, MAX_UINT256, (hash) => {
      onProgress?.({ step: "approving", status: "confirming", txHash: hash, ...at });
    });
  }

  // Pass 2 — one signature covering every window.
  //
  // Nonces are read after the approvals rather than alongside the allowances
  // above: Permit2 keys them by `(owner, token, spender)` and reverts the whole
  // batch on a single stale entry, so the read sits as close to the signature as
  // possible.
  const nonces = await Promise.all(
    entries.map((e) => chain.permit2Allowance(e.token, owner, masp)),
  );
  const permit = {
    details: entries.map((e, i) => ({
      token: e.token,
      amount: e.cap,
      expiration: e.expirationUnixSecs,
      nonce: nonces[i]!.nonce,
    })),
    spender: masp,
    sigDeadline: BigInt(Math.floor(Date.now() / 1000) + SIG_DEADLINE_SECS),
  };
  onProgress?.({ step: "signing", status: "wallet" });
  const { signature } = await chain.signPermit2AllowanceBatch(permit);

  // Pass 3 — one tx establishes every window.
  onProgress?.({ step: "permitting", status: "wallet" });
  await chain.permit2PermitAllowanceBatch({ owner, permit, signature }, (hash) => {
    onProgress?.({ step: "permitting", status: "confirming", txHash: hash });
  });
}

/// Single-token setup, delegating to a one-entry
/// {@link ensurePermit2AuthorizedSetupBatch} so there is one implementation.
export async function ensurePermit2AuthorizedSetup(
  wallet: WalletApi,
  token: EvmAddress,
  cap: bigint,
  expirationUnixSecs: number,
  onProgress?: (step: SetupStep, status: SetupStepPhase, txHash?: string) => void,
): Promise<void> {
  return ensurePermit2AuthorizedSetupBatch(wallet, [{ token, cap, expirationUnixSecs }], (p) =>
    onProgress?.(p.step, p.status, p.txHash),
  );
}
