// The words on the multi-token setup card.
//
// Kept apart from `SetupAllNotice` so the copy rules are testable without the
// registry, wallet and probe hooks the card renders from.

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
