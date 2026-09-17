// Plain-DOM panel for a failed boot: runs before React, so it depends on nothing else.

const STYLES = {
  wrap: {
    maxWidth: "40rem",
    margin: "4rem auto",
    padding: "0 1.5rem",
    fontFamily: "system-ui, sans-serif",
    lineHeight: "1.5",
  },
  heading: {
    fontSize: "1.125rem",
    margin: "0 0 0.75rem",
  },
  detail: {
    whiteSpace: "pre-wrap",
    fontSize: "0.8125rem",
    opacity: "0.8",
    margin: "0",
  },
} satisfies Record<string, Partial<CSSStyleDeclaration>>;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: Partial<CSSStyleDeclaration>,
  text: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.assign(el.style, style);
  // Never `innerHTML`: the message quotes config values and nothing escapes it.
  el.append(text);
  return el;
}

export function renderBootFailure(root: HTMLElement, message: string): void {
  const wrap = element("div", STYLES.wrap, "");
  wrap.append(
    element("h1", STYLES.heading, "This deployment is misconfigured"),
    element("pre", STYLES.detail, message),
  );
  root.replaceChildren(wrap);
}
