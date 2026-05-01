import { describeNskError, parseClaimFragment } from "@/features/claim-link/codec";
import { err, ok, type Result } from "@/shared/lib/result";

export type FragmentError = "missing" | "invalid";
export type FragmentRead = Result<{ hex: string }, { kind: FragmentError; message: string }>;

/// Parse the URL hash fragment into an nsk hex string, distinguishing
/// absent vs malformed input.
export function readFragmentFromHash(hash: string): FragmentRead {
  if (!hash || hash === "#") {
    return err({ kind: "missing", message: "missing claim secret in URL fragment" });
  }
  const hex = hash.startsWith("#") ? hash.slice(1) : hash;
  const parsed = parseClaimFragment(hash);
  if (!parsed.ok) {
    return err({ kind: "invalid", message: describeNskError(parsed.error) });
  }
  return ok({ hex });
}

/// Strip the `#…` from the visible URL so a refresh / share doesn't leak the
/// bearer secret. Idempotent — only acts on the claim path.
export function scrubLocationHash(loc: Location, history: History): void {
  if (loc.pathname === "/claim" && loc.hash) {
    history.replaceState(null, "", loc.pathname);
  }
}
