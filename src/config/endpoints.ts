// Service URLs the user chose in place of the build's, kept in this browser. `env` overlays them
// at load; the settings read and write them here.

import { z } from "zod";
import { createLogger } from "@/shared/lib/logger";
import { reloadPage } from "@/shared/lib/reload";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { localStore, readJson, writeJson } from "@/shared/lib/storage/safe";
import { httpUrl, stripTrailingSlash } from "./url";

const log = createLogger("endpoints");
const KEY = LOCAL_KEYS.endpoints;

/// The services a user can point elsewhere. `rpcProxyUrl` has no build value: unset, each chain
/// reads through the RPC its registry names.
export const ENDPOINT_FIELDS = ["registryUrl", "relayerUrl", "fmdUrl", "rpcProxyUrl"] as const;

export type EndpointField = (typeof ENDPOINT_FIELDS)[number];

export type EndpointOverrides = { [K in EndpointField]?: string };

/// The hosts the shipped CSP's `connect-src` admits over plain http (see `tightenCsp`).
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);

// `httpUrl` reads anything else as a path on this page, which would accept a bare host name.
const typedUrl = z
  .string()
  .trim()
  .regex(/^(https?:\/\/|\/)/i, "must start with https:// or /");

/// A service URL a user may enter: https anywhere, http on this machine or this origin only.
/// `allowAnyHttp` lifts the http rule, for a development build whose CSP has no such limit.
export function endpointUrl({ allowAnyHttp = false }: { allowAnyHttp?: boolean } = {}) {
  // A transform runs only on a value `httpUrl` accepted, so the URL parses.
  return typedUrl.pipe(httpUrl).transform((value, ctx) => {
    const url = new URL(value);
    const refuse = (message: string) => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      return z.NEVER;
    };
    // Credentials make `fetch` throw; a query or fragment breaks `${base}/v1/…`.
    if (url.username || url.password || url.search || url.hash) {
      return refuse("must not carry credentials, a query or a fragment");
    }
    const reachable =
      allowAnyHttp ||
      url.protocol === "https:" ||
      LOOPBACK_HOSTS.has(url.hostname) ||
      url.origin === globalThis.location?.origin;
    if (!reachable) return refuse("must be https, or http on localhost");
    // One spelling per server, since stores are keyed on a digest of it.
    return stripTrailingSlash(`${url.origin}${url.pathname}`);
  });
}

/// `endpointUrl` under this build's rule.
export const userEndpointUrl = endpointUrl({ allowAnyHttp: import.meta.env.DEV });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/// The stored overrides. A field that is missing or no longer valid is left out, so the build's
/// value applies; never throws.
export function readEndpointOverrides(): EndpointOverrides {
  const stored = readJson(localStore, KEY, isRecord);
  if (!stored) return {};
  const out: EndpointOverrides = {};
  for (const field of ENDPOINT_FIELDS) {
    const raw = stored[field];
    if (raw === undefined) continue;
    const parsed = userEndpointUrl.safeParse(raw);
    if (parsed.success) out[field] = parsed.data;
    else log.warn("ignoring an unusable endpoint override", field);
  }
  return out;
}

/// Store `next`, or forget every override when it names none.
function saveEndpointOverrides(next: EndpointOverrides): boolean {
  if (Object.keys(next).length === 0) {
    localStore.remove(KEY);
    return true;
  }
  return writeJson(localStore, KEY, next);
}

/// Store `next` and reload, which is what puts it in force: a loaded tab keeps its endpoints.
/// `false`, and no reload, when the browser refused the write.
export function applyEndpointOverrides(next: EndpointOverrides): boolean {
  if (!saveEndpointOverrides(next)) return false;
  reloadPage();
  return true;
}
