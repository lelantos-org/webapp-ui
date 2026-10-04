/// Hex long enough to be a selector or longer; short values like a chain id stay readable.
const HEX_BLOB = /0x[0-9a-fA-F]{8,}/;

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
    text: "The price moved past your slippage limit. Check the new quote and try again.",
  },
  {
    when: anyOf("expired", "deadline"),
    text: "The quote expired. Check the new one and try again.",
  },
  {
    when: anyOf("nonce too low", "replacement transaction"),
    text: "Your wallet has another transaction pending. Let it finish, or cancel it in the wallet, then try again.",
  },
  {
    when: anyOf("allowance", "permit"),
    text: "The token approval is missing or has expired. Shielding again offers the setup.",
  },
  {
    when: anyOf("unrecognized chain", "unrecognized network"),
    text: "Your wallet does not have this network. Add it in the wallet, then retry.",
  },
  {
    when: both(anyOf("network"), anyOf("changed", "disconnect")),
    text: "The wallet changed network while this was running. Switch back and try again.",
  },
  {
    when: anyOf("execution reverted", "revert"),
    text: "The transaction reverted, so nothing moved. Check your balance, and your slippage on a swap, then try again.",
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
