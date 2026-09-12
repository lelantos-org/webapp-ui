// Small pieces of prose assembled from parts.

/// Join hint fragments with the separator the forms use, dropping empties.
///
/// `undefined` rather than `""` when nothing is left, so "no hint" has one
/// spelling: `AmountHero` renders the hint slot, and points `aria-describedby`
/// at it, only when there is one.
export function joinHint(...parts: Array<string | undefined>): string | undefined {
  const kept = parts.filter((p): p is string => !!p);
  return kept.length > 0 ? kept.join(" · ") : undefined;
}

/// `label` with its first letter capitalised and the rest left alone.
///
/// Only the first letter moves, so copy written in lower case — the step labels
/// and the wallet kinds' prompts — reads as a sentence, while an emphasis spelled
/// in capitals ("this signature IS your key") survives.
export function capitalizeFirst(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/// A count and its noun: "1 link", "3 links", "2 copies".
///
/// `pluralForm` for the nouns that do not take an "s".
export function plural(n: number, noun: string, pluralForm = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : pluralForm}`;
}
