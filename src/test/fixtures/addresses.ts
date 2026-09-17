// Well-formed hex values that are easy to tell apart in a failure message.

type Hex = `0x${string}`;

function repeated(byte: string, bytes: number): Hex {
  if (!/^[0-9a-fA-F]{2}$/.test(byte)) throw new Error(`not one hex byte: ${byte}`);
  return `0x${byte.repeat(bytes)}`;
}

/// A 20-byte address of one repeated byte: `hexAddress("11")` is `0x1111…1111`.
export const hexAddress = (byte: string): Hex => repeated(byte, 20);

/// A 32-byte word of one repeated byte: `hexBytes32("aa")` is `0xaaaa…aaaa`.
export const hexBytes32 = (byte: string): Hex => repeated(byte, 32);
