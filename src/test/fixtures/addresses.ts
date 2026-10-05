// Well-formed addresses and words that are easy to tell apart in a failure message.

type Hex = `0x${string}`;

function repeated(byte: string, bytes: number): Hex {
  if (!/^[0-9a-fA-F]{2}$/.test(byte)) throw new Error(`not one hex byte: ${byte}`);
  return `0x${byte.repeat(bytes)}`;
}

/// A 20-byte address of one repeated byte: `hexAddress("11")` is `0x1111…1111`.
export const hexAddress = (byte: string): Hex => repeated(byte, 20);

/// A 32-byte word of one repeated byte: `hexBytes32("aa")` is `0xaaaa…aaaa`.
export const hexBytes32 = (byte: string): Hex => repeated(byte, 32);

/// A shielded address derived by the SDK, so its checksum holds.
export const SHIELDED_ADDRESS =
  "lelantos1kywv2fthuaqws06velmdvnuft098tpdv9uksafgvmkd5svmx0f3qq3j520lzcqqmp09kzzfrqp26m63dl88pmagf82fv8px7xqzywc9xg38e4dmu3xhcsd4rfdq4tugkhkjd4hq4dhkyt6gcvd7nk243ae6l07rmsd5vnnxspn4zk9l90s5q2shamv";
