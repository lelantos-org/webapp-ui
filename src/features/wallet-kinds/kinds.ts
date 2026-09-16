// The kind registry: every supported kind, and the one entry point that
// switches the session between them. See `index.ts` for the invariant.

import { eip1193Kind } from "./eip1193/kind";
import { passkeyKind } from "./passkey/kind";
import type { KindSnapshot, WalletKind, WalletKindAdapter } from "./types";

/// Every kind, in the order ties are broken.
///
/// Ties should not arise, so this order decides one case only: a browser
/// carrying latches from before `selectKind` enforced the invariant. An injected
/// wallet wins there because it owns the chain, and a passkey taking precedence
/// would leave the app on a network the connected account is not on.
export const WALLET_KINDS: readonly WalletKindAdapter[] = [eip1193Kind, passkeyKind];

export function kindAdapter(kind: WalletKind): WalletKindAdapter {
  const found = WALLET_KINDS.find((a) => a.kind === kind);
  if (!found) throw new Error(`no adapter for wallet kind ${kind}`);
  return found;
}

/// Hand the session to `kind`, detaching every other.
///
/// The one place the "at most one kind connected" invariant is maintained, so
/// that `activeKind` never has to guess. `id` names which instance to attach
/// where the kind has several — see `WalletKindAdapter.attach`.
export function selectKind(kind: WalletKind, id?: string): void {
  for (const adapter of WALLET_KINDS) {
    if (adapter.kind !== kind) adapter.disconnect();
  }
  kindAdapter(kind).attach(id);
}

export interface ActiveKind {
  adapter: WalletKindAdapter;
  snapshot: KindSnapshot;
}

/// The live session, and every kind's snapshot.
export function useWalletKinds(): {
  active: ActiveKind | undefined;
  snapshots: ActiveKind[];
} {
  const snapshots: ActiveKind[] = [];
  for (const adapter of WALLET_KINDS) {
    // Legal despite the loop: `WALLET_KINDS` is a module constant, so the hook
    // count and order are fixed. Suppressed rather than rewritten to name each
    // kind, which would cost the property that adding one touches a single array.
    // biome-ignore lint/correctness/useHookAtTopLevel: WALLET_KINDS is a module constant, so the hook order is fixed.
    snapshots.push({ adapter, snapshot: adapter.useSnapshot() });
  }
  // `find`, not a priority scan: `selectKind` leaves at most one connected. See
  // `WALLET_KINDS` for the one case where that does not hold.
  return { active: snapshots.find((s) => s.snapshot.connected), snapshots };
}
