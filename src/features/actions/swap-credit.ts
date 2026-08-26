// What a swap credits on its output asset.
//
// One answer with two readers: the quote card promises it before the user
// commits, and the pending overlay watches the balance for it afterwards.
// They each called `sizeBNote` themselves and drifted — the overlay omitted
// the relayer's flush fee, which put its watermark above any balance the swap
// could produce, so the leg-2 entry never cleared and sat there settling until
// its TTL dropped it.

import { sizeBNote } from "@lelantos-org/sdk/wallet";

export interface SwapCreditInputs {
  /// Floor the venue must clear, from the quote the proof binds.
  minOut: bigint;
  /// Circuit-unit scale of the output asset.
  scaleOut: bigint;
  /// Protocol fee, in bps.
  feeBps: bigint;
  /// What the relayer charges to flush leg 2, in circuit units of the output
  /// asset. It rides in the same Permit2 pull as the B-note, so a non-zero one
  /// makes the note *smaller*. Zero where deposits are subsidised.
  depositFee: bigint;
}

/// Circuit-unit value the swap's B-note will carry.
///
/// `executeSwap` encodes exactly this as the deposit leg's `publicIn`, so it is
/// what the wallet receives — and a *fixed* amount rather than a floor: the
/// wrapper pulls only what the B-note needs, and forwards a better-than-quoted
/// fill to the treasury as dust. The closed form the callers used to inline is
/// only the lower bound `sizeBNote` starts its walk from, and under-reports
/// whenever the division is inexact.
///
/// `0n` on a degenerate scale — not a credit to show, nor one to wait for.
export function swapCredit(i: SwapCreditInputs): bigint {
  if (i.scaleOut <= 0n) return 0n;
  return sizeBNote(i.minOut, i.scaleOut, i.feeBps, i.depositFee);
}
