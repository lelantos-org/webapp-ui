/// `0x1234ab…cdef12`: head and tail of an address; short values are shown whole.
export function shortAddr(a?: string, n = 6): string {
  if (!a) return "";
  if (a.length <= 2 * n + 2) return a;
  return `${a.slice(0, n + 2)}…${a.slice(-n)}`;
}

/// Case-insensitive address equality. Does not validate.
export function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/// An address laid out for reading.
export interface AddressLayout {
  /// The lead that says only what kind of address it is: `lelantos1`, `0x`. Empty where none.
  prefix: string;
  /// The rest, in rows of `ADDRESS_ROW` groups of `ADDRESS_GROUP` characters.
  rows: string[][];
}

const ADDRESS_GROUP = 4;
const ADDRESS_ROW = 6;

/// An address in rows of six groups of four. The rows depend on the address alone and never on
/// the screen, so two copies are compared by position.
export function addressLayout(value: string): AddressLayout {
  const prefix = /^(?:[a-z]+1|0x)/.exec(value)?.[0] ?? "";
  const groups = value.slice(prefix.length).match(new RegExp(`.{1,${ADDRESS_GROUP}}`, "g")) ?? [];
  const rows: string[][] = [];
  for (let i = 0; i < groups.length; i += ADDRESS_ROW) rows.push(groups.slice(i, i + ADDRESS_ROW));
  return { prefix, rows };
}

/// The first two and last two groups of an address, as text.
export function addressEnds(value: string): { prefix: string; head: string; tail: string } {
  const { prefix, rows } = addressLayout(value);
  const groups = rows.flat();
  return { prefix, head: groups.slice(0, 2).join(" "), tail: groups.slice(-2).join(" ") };
}
