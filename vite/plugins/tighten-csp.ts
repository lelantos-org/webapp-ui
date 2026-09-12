import type { Plugin } from "vite";

/// `String.replace` that fails the build when the needle is gone.
///
/// Every rewrite below *removes* an allowance. A plain `.replace` that stops
/// matching is silent, and the failure mode is the dangerous direction: the dev
/// policy ships to production intact. Bare `.replace` here would mean a reworded
/// directive in `index.html` quietly re-enables `unsafe-inline` on the page that
/// holds the spending key.
function mustReplace(html: string, from: string, to: string): string {
  if (!html.includes(from)) {
    throw new Error(
      `tightenCsp: no match for ${JSON.stringify(from)}. The meta CSP in index.html changed — ` +
        "update this plugin rather than letting the dev policy ship.",
    );
  }
  return html.replace(from, to);
}

/// The production form of `index.html`'s meta CSP. See `tightenCsp`.
export function tightenCspHtml(html: string): string {
  let out = mustReplace(
    html,
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "script-src 'self' 'wasm-unsafe-eval'",
  );
  out = mustReplace(
    out,
    "connect-src 'self' http: https: ws: wss:",
    "connect-src 'self' https: wss:",
  );
  return mustReplace(
    out,
    "form-action 'none'",
    "form-action 'none'; require-trusted-types-for 'script'; trusted-types 'none'",
  );
}

/// Tightens the `index.html` CSP for the built app.
///
/// One HTML file serves both `vite dev` and the production image, so its meta
/// policy has to be the union of what both need — and the dev half is the loose
/// half. `@vitejs/plugin-react` injects an inline Fast Refresh preamble, which
/// forces `script-src 'unsafe-inline'`; a production build emits no inline
/// script at all (verified against `dist/index.html`), so shipping that
/// allowance only widens what an HTML injection could do on a page that handles
/// a bearer key.
///
/// `connect-src` drops `http:` and `ws:` for the same reason: the app requires
/// a secure context anyway (`crossOriginIsolated` for the wasm prover), so
/// plaintext destinations are only useful to an exfiltrator. `https:`/`wss:`
/// stay broad because chain RPC URLs come from registry-webserver's
/// `/v1/chains` at runtime and cannot be enumerated at build time.
///
/// Trusted Types is added here rather than in `index.html` because `vite dev`
/// injects its error overlay through `innerHTML`, which the policy would trip.
/// Nothing in `src/` uses an injection sink — no `innerHTML`,
/// `dangerouslySetInnerHTML`, or `document.write` — so enforcing it costs
/// nothing today and turns a future one into a visible error instead of a silent
/// regression. Engines without support ignore both directives.
export function tightenCsp(): Plugin {
  return {
    name: "tighten-csp",
    apply: "build",
    transformIndexHtml(html) {
      return tightenCspHtml(html);
    },
  };
}
