// EVM and shielded addresses, compared and abbreviated.

/// `0x1234ab…cdef12`: the head and tail of an address, for a line with no room
/// for all of it. Anything short enough to show whole is shown whole.
export function shortAddr(a?: string, n = 6): string {
  if (!a) return "";
  if (a.length <= 2 * n + 2) return a;
  return `${a.slice(0, n + 2)}…${a.slice(-n)}`;
}

/// Case-insensitive address equality.
///
/// Addresses arrive in whichever spelling their source uses — EIP-55 checksummed
/// from the SDK and most wallets, lowercase from the registry and some others —
/// so `===` on the raw strings reports two spellings of one account or token as
/// two. Does not validate: a caller that must reject a malformed address checks
/// its shape first.
export function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
