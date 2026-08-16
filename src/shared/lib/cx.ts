/// Joins conditional class names: `cx("a", cond && "b")`. Falsy parts drop out,
/// which keeps a multi-modifier `className` readable as a list.
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
