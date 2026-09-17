// URL checks for untrusted input: VITE_* settings and per-chain URLs fetched at runtime.

import { toAbsoluteUrl } from "@lelantos-org/sdk/primitives";
import { z } from "zod";

/// True for `http:` and `https:` only; rejects `javascript:` and `data:` hrefs.
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const HTTP_URL_MESSAGE = "must resolve to an http(s) URL";

/// Drop a trailing slash so callers can write `${base}/v1/thing`.
export function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/// An http(s) URL; page-relative paths resolve against the page origin first.
export const httpUrl = z
  .string()
  .transform(toAbsoluteUrl)
  .refine(isHttpUrl, HTTP_URL_MESSAGE)
  .transform(stripTrailingSlash);
