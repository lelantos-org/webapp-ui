/// Two characters that identify the connected account at a glance.
///
/// The Ethereum address when there is one, since that is the account the user's
/// wallet shows them: the two hex digits after `0x`, lower-cased so the avatar
/// does not change with checksum casing. A passkey session has no public
/// account, so the shielded address stands in — the first two characters of its
/// bech32 data part, after the `lelantos1` prefix every address shares and that
/// would make every avatar read the same.
export function accountInitials(eth: string | undefined, shielded: string | undefined): string {
  if (eth && /^0x[0-9a-f]{2}/i.test(eth)) return eth.slice(2, 4).toLowerCase();
  if (!shielded) return "";
  const sep = shielded.lastIndexOf("1");
  const data = sep > 0 ? shielded.slice(sep + 1) : shielded;
  return data.slice(0, 2).toLowerCase();
}
