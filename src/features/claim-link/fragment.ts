import { err, ok, type Result } from "@/shared/lib/result";
import { type ClaimPayload, describeClaimError, parseClaimFragment } from "./codec";

export type FragmentError = "missing" | "invalid";
export type FragmentRead = Result<ClaimPayload, { kind: FragmentError; message: string }>;

/// Parse the URL hash fragment into a claim payload, distinguishing absent
/// from malformed input.
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

/// Strip the `#…` from the visible URL so a refresh / share doesn't leak the
/// bearer secret. Idempotent — only acts on the claim path.
///
/// Trailing slashes are tolerated. React Router routes `/claim/` to the same
/// component, but an exact `=== "/claim"` test did not match it, so any link
/// written with a trailing slash kept its secret in the address bar for the
/// life of the page.
export function scrubLocationHash(loc: Location, history: History): void {
  const path = loc.pathname.replace(/\/+$/, "") || "/";
  if (path === "/claim" && loc.hash) {
    history.replaceState(null, "", loc.pathname);
  }
}
