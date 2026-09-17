/// Hex long enough to be a selector or longer; short values like a chain id stay readable.
const HEX_BLOB = /0x[0-9a-fA-F]{8,}/;

/// Does the message contain any of these?
const anyOf =
  (...words: string[]) =>
  (lower: string) =>
    words.some((w) => lower.includes(w));

const both = (a: (s: string) => boolean, b: (s: string) => boolean) => (lower: string) =>
  a(lower) && b(lower);

/// Order matters: the first match wins, so broad rules like "revert" stay last.
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

/// Whether a raw message can be shown as is: present, one short line, no hex payload.
export function isPresentable(raw: string): boolean {
  return !!raw && raw.length < 140 && !HEX_BLOB.test(raw) && !raw.includes("\n");
}
