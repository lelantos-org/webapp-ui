import type { Plugin } from "vite";

/// `String.replace` that fails the build when the needle is gone, so the loose dev CSP never ships.
function mustReplace(html: string, from: string, to: string): string {
  if (!html.includes(from)) {
    throw new Error(
      `tightenCsp: no match for ${JSON.stringify(from)}. The meta CSP in index.html changed — ` +
        "update this plugin rather than letting the dev policy ship.",
    );
  }
  return html.replace(from, to);
}

/// The production form of `index.html`'s meta CSP.
export function tightenCspHtml(html: string): string {
  let out = mustReplace(
    html,
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "script-src 'self' 'wasm-unsafe-eval'",
  );
  out = mustReplace(
    out,
    "connect-src 'self' http: https: ws: wss:",
    // Plain http on this machine only: what `endpointUrl` lets a user name for a local service.
    "connect-src 'self' https: wss: http://localhost:* http://127.0.0.1:*",
  );
  return mustReplace(
    out,
    "form-action 'none'",
    "form-action 'none'; require-trusted-types-for 'script'; trusted-types 'none'",
  );
}

/// Build-only: drops dev-only `unsafe-inline`, `ws:` and non-loopback `http:`, and adds Trusted
/// Types to the meta CSP.
export function tightenCsp(): Plugin {
  return {
    name: "tighten-csp",
    apply: "build",
    transformIndexHtml(html) {
      return tightenCspHtml(html);
    },
  };
}
