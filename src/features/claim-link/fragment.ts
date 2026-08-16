import {
  type ClaimPayload,
  describeClaimError,
  parseClaimFragment,
} from "@/features/claim-link/codec";
import { err, ok, type Result } from "@/shared/lib/result";

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
export function scrubLocationHash(loc: Location, history: History): void {
  if (loc.pathname === "/claim" && loc.hash) {
    history.replaceState(null, "", loc.pathname);
  }
}
