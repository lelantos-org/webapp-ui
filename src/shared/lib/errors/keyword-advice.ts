// Advice for faults recognised by their message text.
//
// The fallback for errors that carry no code worth switching on: a viem revert,
// a wallet's or the browser's own wording. SDK faults are not matched here:
// every one carries a `code`, worded in `wallet-copy.ts`, so a rule reading
// SDK message text would only shadow a curated line or go stale with it.

/// Hex long enough to be a selector (8), address (40), hash (64) or calldata.
///
/// The length bound keeps short values such as a chain id (`0x7a69`) from
/// matching, which would flatten an otherwise readable wallet message to
/// "Something went wrong".
const HEX_BLOB = /0x[0-9a-fA-F]{8,}/;

/// Does the message contain any of these?
const anyOf =
  (...words: string[]) =>
  (lower: string) =>
    words.some((w) => lower.includes(w));

/// Both must hold; used by the one rule that is a conjunction rather than a
/// list.
const both = (a: (s: string) => boolean, b: (s: string) => boolean) => (lower: string) =>
  a(lower) && b(lower);

/// Advice for the faults worth wording here, matched on the raw message.
///
/// Order is significant: several rules overlap and the first match wins.
/// "allowance" would otherwise absorb an expired permit that the quote rule
/// above it words better, and "revert" at the bottom would absorb a slippage or
/// deadline revert ("execution reverted: …") that the rules above it name. A
/// single ordered table makes placement the only thing to check when adding a
/// rule.
const KEYWORD_ADVICE: ReadonlyArray<{ when(lower: string): boolean; text: string }> = [
  {
    when: anyOf("slippage", "min out", "minout"),
    text: "Price moved past your slippage limit. Refresh quote and retry.",
  },
  { when: anyOf("expired", "deadline"), text: "Quote expired. Refresh and retry." },
  {
    when: anyOf("nonce too low", "replacement transaction"),
    text: "Wallet nonce conflict. Reset pending txs and retry.",
  },
  {
    when: anyOf("allowance", "permit"),
    text: "Token approval missing or expired. Re-run setup.",
  },
  {
    // Reaches the user only when adding the chain also failed, since the switch
    // path adds it automatically. Worded here because the wallet's own message
    // does not state the action to take.
    when: anyOf("unrecognized chain", "unrecognized network"),
    text: "Your wallet does not have this network. Add it in the wallet, then retry.",
  },
  {
    when: both(anyOf("network"), anyOf("changed", "disconnect")),
    text: "Network changed mid-flight. Reconnect wallet and retry.",
  },
  {
    when: anyOf("execution reverted", "revert"),
    text: "Transaction reverted on-chain. Check balance and slippage, then retry.",
  },
];

/// The worded advice for a raw message, if any rule recognises it.
export function keywordAdvice(raw: string): string | undefined {
  const lower = raw.toLowerCase();
  return KEYWORD_ADVICE.find((entry) => entry.when(lower))?.text;
}

/// Whether a raw message can be shown as it is: present, one short line, and no
/// hex payload in it.
export function isPresentable(raw: string): boolean {
  return !!raw && raw.length < 140 && !HEX_BLOB.test(raw) && !raw.includes("\n");
}
