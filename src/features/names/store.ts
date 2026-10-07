// The handles each account claimed from this browser, one list per (chain, account). The chain is
// the source of truth for who holds a handle; this only remembers which one to show.

import { chainKey } from "@/config/chains";
import { createLogger } from "@/shared/lib/logger";
import { accountDigest } from "@/shared/lib/storage/digest";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { createRecordStore, type RecordStore } from "@/shared/lib/storage/record-store";
import { type ClaimedHandle, isRecordArray } from "./record";

const log = createLogger("names");

const stores = new Map<string, RecordStore<ClaimedHandle>>();

/// The store of one account's handles. `account` is its shielded address, never an EVM account.
function storeOf(chainId: bigint, account: string): RecordStore<ClaimedHandle> {
  const key = `${LOCAL_KEYS.claimedHandlesPrefix}${chainKey(chainId)}:${accountDigest(account)}`;
  let store = stores.get(key);
  if (!store) {
    store = createRecordStore<ClaimedHandle>({
      key,
      noun: "claimed handles",
      log,
      isRecordArray,
      order: (a, b) => b.claimedAt - a.claimedAt,
    });
    stores.set(key, store);
  }
  return store;
}

export function subscribeClaimedHandles(
  chainId: bigint,
  account: string,
  listener: () => void,
): () => void {
  return storeOf(chainId, account).subscribe(listener);
}

/// The handles `account` claimed on `chainId`, newest first, with a stable identity between changes.
export function claimedHandlesSnapshot(chainId: bigint, account: string): ClaimedHandle[] {
  return storeOf(chainId, account).snapshot();
}

/// Record that `account` claimed `label`. Claiming the same label again moves it to the front.
export function rememberClaimedHandle(
  chainId: bigint,
  account: string,
  claimed: Pick<ClaimedHandle, "label" | "address">,
  now = Date.now(),
): void {
  const store = storeOf(chainId, account);
  const others = store.snapshot().filter((r) => r.label !== claimed.label);
  store.persist([{ label: claimed.label, address: claimed.address, claimedAt: now }, ...others]);
}

/// Test seam: drop every parsed snapshot. Pair with `localStorage.clear()`.
export function resetForTest(): void {
  stores.clear();
}
