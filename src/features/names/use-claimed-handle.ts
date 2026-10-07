import { useCallback, useSyncExternalStore } from "react";
import type { ClaimedHandle } from "./record";
import { claimedHandlesSnapshot, subscribeClaimedHandles } from "./store";

const NONE: ClaimedHandle[] = [];

/// The handle `account` last claimed on `chainId` from this browser, if any. `account` is the
/// wallet's shielded address.
export function useClaimedHandle(
  chainId: bigint | undefined,
  account: string | undefined,
): ClaimedHandle | undefined {
  const known = chainId !== undefined && account !== undefined;
  const subscribe = useCallback(
    (listener: () => void) =>
      known ? subscribeClaimedHandles(chainId, account, listener) : () => {},
    [known, chainId, account],
  );
  const read = useCallback(
    () => (known ? claimedHandlesSnapshot(chainId, account) : NONE),
    [known, chainId, account],
  );
  return useSyncExternalStore(subscribe, read, read)[0];
}
