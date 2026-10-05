import { MEMO_BYTES } from "@lelantos-org/sdk/primitives";
import { plural } from "@/shared/lib/format/text";

const encoder = new TextEncoder();

/// `text`'s size as the SDK's `MEMO_BYTES` limit counts it: UTF-8 bytes, not characters.
export function memoByteLength(text: string): number {
  return encoder.encode(text).length;
}

/// Why `text` cannot be sent as a memo, or `undefined` when it can. The empty string is no memo.
export function memoProblem(text: string): string | undefined {
  if (text.includes("\0")) return "A memo can't contain that character";
  const over = memoByteLength(text) - MEMO_BYTES;
  return over > 0 ? `That memo is ${plural(over, "byte")} too long` : undefined;
}
