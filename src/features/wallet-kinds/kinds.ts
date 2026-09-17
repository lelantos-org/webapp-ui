import { eip1193Kind } from "./eip1193/kind";
import { passkeyKind } from "./passkey/kind";
import type { KindSnapshot, WalletKind, WalletKindAdapter } from "./types";

/// Every kind, in tie-break order: an injected wallet wins, as it owns the chain.
export const WALLET_KINDS: readonly WalletKindAdapter[] = [eip1193Kind, passkeyKind];

export function kindAdapter(kind: WalletKind): WalletKindAdapter {
  const found = WALLET_KINDS.find((a) => a.kind === kind);
  if (!found) throw new Error(`no adapter for wallet kind ${kind}`);
  return found;
}

/// Hand the session to `kind`, detaching every other: the one-session invariant lives here.
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
    // biome-ignore lint/correctness/useHookAtTopLevel: WALLET_KINDS is a module constant, so the hook order is fixed.
    snapshots.push({ adapter, snapshot: adapter.useSnapshot() });
  }
  return { active: snapshots.find((s) => s.snapshot.connected), snapshots };
}
