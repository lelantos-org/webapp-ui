/// Join hint fragments with " · ", dropping empties; `undefined` when nothing is left.
export function joinHint(...parts: Array<string | undefined>): string | undefined {
  const kept = parts.filter((p): p is string => !!p);
  return kept.length > 0 ? kept.join(" · ") : undefined;
}

/// `label` with its first letter capitalised and the rest left alone.
export function capitalizeFirst(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/// A count and its noun: "1 link", "3 links", "2 copies".
export function plural(n: number, noun: string, pluralForm = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : pluralForm}`;
}
