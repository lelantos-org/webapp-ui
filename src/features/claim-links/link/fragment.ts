import { err, ok, type Result } from "@/shared/lib/result";
import { type ClaimPayload, describeClaimError, parseClaimFragment } from "./codec";

export type FragmentError = "missing" | "invalid";
export type FragmentRead = Result<ClaimPayload, { kind: FragmentError; message: string }>;

/// Parse the URL hash into a claim payload, telling a missing fragment from a malformed one.
export function readFragmentFromHash(hash: string): FragmentRead {
  if (!hash || hash === "#") {
    return err({ kind: "missing", message: "missing claim secret in URL fragment" });
  }
  const parsed = parseClaimFragment(hash);
  if (!parsed.ok) {
    return err({ kind: "invalid", message: describeClaimError(parsed.error) });
  }
  return ok(parsed.value);
}

/// Strip the bearer secret from the URL on `/claim`, trailing slash included, so it cannot leak.
export function scrubLocationHash(loc: Location, history: History): void {
  const path = loc.pathname.replace(/\/+$/, "") || "/";
  if (path === "/claim" && loc.hash) {
    history.replaceState(null, "", loc.pathname);
  }
}
