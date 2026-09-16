// URL shape checks shared by the two places untrusted URLs enter the app.
//
// There are two such places and they warrant the same rule: build-time settings (`VITE_*`), and the per-chain
// URLs protocol-webserver publishes at runtime. The second is the one that
// matters — those arrive over the network and reach `href`, `window.open` and
// `wallet_addEthereumChain`.

import { toAbsoluteUrl } from "@lelantos-org/sdk/primitives";
import { z } from "zod";

/// True for `http:` and `https:` only.
///
/// The scheme is the whole point. `javascript:` in an `href` is script execution
/// in this origin, and `data:` is nearly as good for an attacker; both parse
/// perfectly well as URLs, so a `z.string().url()` would let either through.
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const HTTP_URL_MESSAGE = "must resolve to an http(s) URL";

/// Drop a trailing slash so every caller can write `${base}/v1/thing`.
///
/// Callers build request URLs by template rather than with `new URL`, so a base
/// ending in `/` yields `//v1/thing`. Some servers treat that as a distinct path
/// and 404; a proxy may collapse it, which is worse, because it works in one
/// deployment and not the next.
export function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/// An http(s) URL, page-relative spellings allowed.
///
/// `toAbsoluteUrl` first, so `/rpc/v1/31337` — how a same-origin proxy is
/// published, and what the dev stack actually configures — resolves against the
/// page origin before the scheme is judged. `http:` stays allowed rather than
/// being pinned to `https:`: local stacks serve plain HTTP, and the property
/// worth enforcing here is that the scheme is a *fetchable* one, not that it is
/// encrypted. Transport security is the deployment's job, and Cloudflare and
/// Caddy already force it.
export const httpUrl = z
  .string()
  .transform(toAbsoluteUrl)
  .refine(isHttpUrl, HTTP_URL_MESSAGE)
  .transform(stripTrailingSlash);
