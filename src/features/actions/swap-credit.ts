// What a swap credits on its output asset.
//
// One answer with two readers: the quote card states it before the user commits,
// and the pending overlay watches the balance for it afterwards. Computed once
// here so the two cannot disagree — an overlay omitting the relayer's flush fee
// would set its watermark above any balance the swap can produce, leaving the
// leg-2 entry settling until its TTL dropped it.

import { sizeBNote } from "@lelantos-org/sdk/wallet";

export interface SwapCreditInputs {
  /// Floor the venue must clear, from the quote the proof binds.
  minOut: bigint;
  /// Circuit-unit scale of the output asset.
  scaleOut: bigint;
  /// Protocol fee, in bps.
  feeBps: bigint;
  /// What the relayer charges to flush leg 2, in circuit units of the output
  /// asset. It rides in the same Permit2 pull as the B-note, so a non-zero value
  /// makes the note smaller. Zero where deposits are subsidised.
  depositFee: bigint;
}

/// Circuit-unit value the swap's B-note will carry.
///
/// `executeSwap` encodes this as the deposit leg's `publicIn`, so it is what the
/// wallet receives, and it is a fixed amount rather than a floor: the wrapper
/// pulls only what the B-note needs and forwards a better-than-quoted fill to the
/// treasury as dust. `sizeBNote` is used rather than the closed form, which is
/// only its starting lower bound and under-reports when the division is inexact.
///
/// Returns `0n` on a degenerate scale: neither a credit to show nor one to await.
export function swapCredit(i: SwapCreditInputs): bigint {
  if (i.scaleOut <= 0n) return 0n;
  return sizeBNote(i.minOut, i.scaleOut, i.feeBps, i.depositFee);
}
