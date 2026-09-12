// The words and step rows of a Permit2 setup run, apart from the modal that
// shows them, so they read — and test — without a wallet.

import type { RegisteredAsset } from "@/config/chains";
import { plural } from "@/shared/lib/text";
import type { StepperItem } from "@/shared/ui/Stepper";
import type { SetupProgress, SetupStep } from "./permit2-setup";

const SHARED_STEPS: { id: SetupStep; label: string }[] = [
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
const approvalStepId = (token: string) => `approving:${token.toLowerCase()}`;

/// One approval row per token that needs one, then the shared steps. They are
/// separate wallet prompts, so a single combined row would show a finished step
/// while further prompts were still coming.
export function setupSteps(toApprove: readonly RegisteredAsset[]): StepperItem[] {
  return [
    ...toApprove.map((a) => ({ id: approvalStepId(a.token), label: `authorize ${a.symbol}` })),
    ...SHARED_STEPS,
  ];
}

/// The row the run is on.
export function currentStepId(progress: SetupProgress): string {
  return progress.step === "approving" ? approvalStepId(progress.token) : progress.step;
}
