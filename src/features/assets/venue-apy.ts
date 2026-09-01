// Rendering the relayer's rate estimate.
//
// The measurement is the relayer's: it reads the venue's ERC-4626 vault at two
// blocks a week apart and publishes the annualized result on `/chains`. It lives
// there rather than here for two reasons the browser cannot fix. A public RPC
// prunes state within hours, so the historical reads the estimate needs are
// refused in a wallet and answered from the relayer's own node; and a rate is a
// property of the venue, identical for every holder, so measuring it once per
// deployment rather than once per open tab is simply what it is.
//
// What is left in the client is the labelling — and the care that goes with it.
// The figure describes the venue, not the wallet: a deposit made today into a
// venue that ran at 4% all year has earned nothing. The wallet's own return is
// the `earned` column, and the two must never be read as the same claim.

/// How the window is said out loud: `7 days`, or `a day` for a single one.
///
/// Read from the response rather than fixed here. The relayer aims at a week but
/// publishes what its two readings actually spanned, and a client that says "the
/// last 7 days" over a nine-day measurement is stating something nobody
/// measured.
export function formatWindow(days: number): string {
  return days === 1 ? "a day" : `${days} days`;
}
