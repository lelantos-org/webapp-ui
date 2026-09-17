import { formatAmount, normalizeNumericInput } from "@/shared/lib/format/number";

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
] as const;

const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
] as const;

/// Short-scale group names; past decillion `amountInWords` falls back to digits.
const SCALES = [
  "",
  "thousand",
  "million",
  "billion",
  "trillion",
  "quadrillion",
  "quintillion",
  "sextillion",
  "septillion",
  "octillion",
  "nonillion",
  "decillion",
] as const;

/// Largest count `numberWord` spells.
const SPELLED_UP_TO = 10;

/// A small count as a word ("four"), or digits past ten.
export function numberWord(n: number): string {
  const word = Number.isInteger(n) && n >= 0 && n <= SPELLED_UP_TO ? ONES[n] : undefined;
  return word ?? String(n);
}

/// Words for 0 < n < 1000.
function hundredsInWords(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds > 0) parts.push(`${ONES[hundreds]} hundred`);
  if (rest > 0 && rest < 20) parts.push(ONES[rest] as string);
  else if (rest >= 20) {
    const unit = rest % 10;
    const tens = TENS[Math.floor(rest / 10)] as string;
    parts.push(unit === 0 ? tens : `${tens}-${ONES[unit]}`);
  }
  return parts.join(" ");
}

/// Words for a non-negative integer, lowercase. `undefined` past `SCALES`.
function integerInWords(n: bigint): string | undefined {
  if (n === 0n) return ONES[0];
  const groups: string[] = [];
  let rest = n;
  let scale = 0;
  while (rest > 0n) {
    if (scale >= SCALES.length) return undefined;
    const group = Number(rest % 1000n);
    if (group > 0) {
      const name = SCALES[scale];
      groups.unshift(name ? `${hundredsInWords(group)} ${name}` : hundredsInWords(group));
    }
    rest /= 1000n;
    scale += 1;
  }
  return groups.join(" ");
}

/// A typed amount as a cheque writes it: "Two hundred fifty and 00/100 USDC". `""` if malformed.
export function amountInWords(value: string, symbol: string): string {
  const m = /^(\d+)(?:\.(\d*))?$/.exec(normalizeNumericInput(value));
  if (!m) return "";
  const whole = BigInt(m[1] as string);
  const frac = m[2] ?? "";
  const digits = Math.max(2, frac.length);
  const numerator = frac.padEnd(digits, "0");
  const denominator = `1${"0".repeat(digits)}`;
  const words = integerInWords(whole) ?? formatAmount(whole);
  const lead = words.charAt(0).toUpperCase() + words.slice(1);
  const unit = symbol.trim();
  return `${lead} and ${numerator}/${denominator}${unit ? ` ${unit}` : ""}`;
}
