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

/// A long address broken into fours, so it is compared whole and not just by its ends.
export function grouped(value: string, size = 4): string {
  return value.replace(new RegExp(`.{1,${size}}`, "g"), "$& ").trimEnd();
}
