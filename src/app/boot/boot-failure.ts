// The panel shown when the app cannot start at all.
//
// Plain DOM rather than React: `config/env` parses at module-evaluation time, so
// a missing or malformed `VITE_*` throws before `createRoot` is called and
// before any `ErrorBoundary` exists. Without this the failure renders as a blank
// page with the explanation only in the console.
//
// Styled inline rather than through `styles.css`. This screen must render when
// the rest of the app has not, so it depends on nothing that could itself have
// failed.

/// Inline styles as property maps rather than a `cssText` blob, which is a string
/// the type checker cannot inspect and the formatter cannot reach.
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
  // `append` rather than `innerHTML`: the message quotes configuration values,
  // and this is the one render path with no framework escaping.
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
