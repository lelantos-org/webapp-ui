// The words of Permit2 setup, apart from what shows them, so they read — and
// test — without a wallet, the registry or the probe hooks: the step rows of a
// setup run, and the multi-token setup card under the Shield form.

import type { AllowanceSetupStep } from "@lelantos-org/sdk";
import type { RegisteredAsset } from "@/config/chains";
import { plural } from "@/shared/lib/format/text";
import type { StepperItem } from "@/shared/ui/Stepper";
import { tokenKey } from "./by-token";
import type { SetupProgress } from "./permit2-setup";

const SHARED_STEPS: { id: AllowanceSetupStep; label: string }[] = [
  { id: "signing", label: "sign allowances" },
  { id: "permitting", label: "submit allowances on-chain" },
];

/// The approval line names its token and position, since it is the repeating
/// step; without them, N identical prompts read as one stuck prompt.
export function runningCopy(p: SetupProgress, symbolOf: (t: string) => string): string {
  if (p.step === "approving") {
    const symbol = symbolOf(p.token);
    const where = p.total > 1 ? ` (${p.index}/${p.total})` : "";
    return p.status === "wallet"
      ? `Approving ${symbol} for Permit2${where} — confirm in your wallet.`
      : `${symbol} approval submitted${where}. Waiting for block confirmation…`;
  }
  if (p.step === "signing") return "Sign the allowances — no gas, just one signature.";
  return p.status === "wallet"
    ? "Confirm the on-chain submission in your wallet."
    : "Submitted. Waiting for block confirmation…";
}

/// The cost of a run: approvals do not batch, so N tokens means N prompts plus
/// the two shared steps. Shared with `SetupAllModal`, which quotes the same
/// figure before the flow starts.
export function setupCostLine(approvals: number): string {
  const a = approvals > 0 ? `${plural(approvals, "approval")}, ` : "";
  return `${a}1 signature, 1 transaction`;
}

/// Where the flow will start, before any progress callback has fired.
export function initialProgress(toApprove: readonly RegisteredAsset[]): SetupProgress {
  const first = toApprove[0];
  return first
    ? { step: "approving", status: "wallet", token: first.token, index: 1, total: toApprove.length }
    : { step: "signing", status: "wallet" };
}

/// Stepper row id for one token's approval. Shared by the row and the highlight,
/// so a rename cannot desynchronise them.
///
/// Keyed by token, not asset id: the pool registers a separate id per yield
/// variant over the same ERC-20, and the approval is per token. Keyed by id, six
/// ids over three tokens drew six rows, and `SetupProgress.token` then resolved
/// to whichever id came first — so the highlight jumped back to row 1 on the
/// fourth prompt.
const approvalStepId = (t: { token: string }) => `approving:${tokenKey(t)}`;

/// One approval row per token that needs one, then the shared steps. They are
/// separate wallet prompts, so a single combined row would show a finished step
/// while further prompts were still coming.
export function setupSteps(toApprove: readonly RegisteredAsset[]): StepperItem[] {
  return [
    ...toApprove.map((a) => ({ id: approvalStepId(a), label: `authorize ${a.symbol}` })),
    ...SHARED_STEPS,
  ];
}

/// The row the run is on.
export function currentStepId(progress: SetupProgress): string {
  return progress.step === "approving" ? approvalStepId(progress) : progress.step;
}

// The multi-token setup card (`SetupAllNotice`).

/// The asset the Shield form has selected, when its own deposit needs no setup.
export interface SetupCurrentAsset {
  symbol: string;
  /// Native coin, which never goes through Permit2 — as opposed to a token
  /// that is already approved.
  native: boolean;
}

/// "USDC and WBTC", "USDC, DAI and WBTC".
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// The setup card a deposit is blocked on (`SetupNotice`), and the submit reason
// under it. More than one name for a deposit paying its relayer in another token.

/// "Couldn't check USDC's approval", "Couldn't check approvals for USDC and DAI".
export function uncheckedApprovalsLine(names: readonly string[]): string {
  return names.length > 1
    ? `Couldn't check approvals for ${joinNames(names)}`
    : `Couldn't check ${joinNames(names)}'s approval`;
}

/// Title and body of the card for the tokens a deposit still needs set up.
///
/// `willApproveErc20`: the run sends an ERC-20 → Permit2 approval first, which
/// the body owns up to. `unknown`: the allowances could not be read at all.
export function depositSetupCopy(
  names: readonly string[],
  { unknown, willApproveErc20 }: { unknown: boolean; willApproveErc20: boolean },
): { title: string; body: string } {
  const list = joinNames(names);
  const one = names.length <= 1;
  if (unknown) {
    return {
      title: uncheckedApprovalsLine(names),
      body: `The approval status for ${list} couldn't be read. Running setup authorizes ${one ? "it" : "them"} either way.`,
    };
  }
  const title = `${list} ${one ? "needs" : "need"} one-time setup`;
  if (willApproveErc20) {
    return {
      title,
      body: one
        ? `Approve ${list} once and authorize a spending window. Shielding ${list} then takes a single confirmation in your wallet.`
        : `Approve ${list} once and authorize their spending windows. This deposit then takes a single confirmation in your wallet.`,
    };
  }
  return {
    title,
    body: one
      ? `Authorize a new spending window for ${list} that covers this amount.`
      : `Authorize new spending windows for ${list} that cover this deposit and its relayer fee.`,
  };
}

/// Title and body for `names` outstanding.
export function setupAllCopy(
  names: readonly string[],
  current: SetupCurrentAsset | undefined,
): { title: string; short: string; body: string } {
  const n = names.length;
  const title =
    n <= 3
      ? `${joinNames(names)} ${n === 1 ? "needs" : "need"} one-time setup`
      : `${n} tokens need one-time setup`;
  const short = `One-time setup for ${n === 1 ? names[0] : `${n} tokens`}`;
  const lead = current
    ? `Not needed for this deposit — ${current.symbol} ${current.native ? "never requires it" : "is already set up"}. `
    : "";
  const them = n === 1 ? "it" : n === 2 ? "those two" : `those ${n}`;
  return {
    title,
    short,
    body: `${lead}Do it whenever you like; shielding ${them} later then takes a single confirmation in your wallet.`,
  };
}
