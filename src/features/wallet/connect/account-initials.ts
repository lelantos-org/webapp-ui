/// Two characters identifying the account: from the Ethereum address, else the shielded one after `lelantos1`.
export function accountInitials(eth: string | undefined, shielded: string | undefined): string {
  if (eth && /^0x[0-9a-f]{2}/i.test(eth)) return eth.slice(2, 4).toLowerCase();
  if (!shielded) return "";
  const sep = shielded.lastIndexOf("1");
  const data = sep > 0 ? shielded.slice(sep + 1) : shielded;
  return data.slice(0, 2).toLowerCase();
}
