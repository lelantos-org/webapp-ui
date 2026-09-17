import type { SyncStrategy } from "@lelantos-org/sdk/advanced";
import {
  cryptoContext,
  deriveKeysFromNsk,
  deriveSubscriptionToken,
  detectionKeyFor,
  detectionKeyToHex,
  type Field,
  FMD_DEFAULT_GAMMA,
  subscriptionTokenToHex,
} from "@lelantos-org/sdk/primitives";
import { FmdClient, GAMMA_MIN } from "@lelantos-org/sdk/services";
import { chainKey } from "@/config/chains";
import { DAY_MS } from "@/shared/lib/format/time";
import { createLogger } from "@/shared/lib/logger";
import { accountDigest } from "@/shared/lib/storage/digest";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { localStore, readJson, writeJson } from "@/shared/lib/storage/safe";
import { jitter } from "@/shared/query/cadence";

const log = createLogger("fmd-sub");
// Keys digest the address so they do not enumerate connected accounts.
const PREFIX = LOCAL_KEYS.fmdSubscriptionPrefix;

/// Decoys a match set must retain (server's `MIN_EXPECTED_DECOYS`); stricter than the server below it.
const DECOY_FLOOR = 64;

/// Token re-confirm interval, jittered once at write so re-confirms are not a daily fingerprint.
const CACHE_TTL_MS = DAY_MS;

// Expiring hint: trusting a token forever turns an expired subscription into a silent zero balance.
const tokenCache = {
  key: (chainId: bigint, ethAddr: string) =>
    `${PREFIX}${chainKey(chainId)}:${accountDigest(ethAddr)}`,

  /// The cached token, or `undefined` if absent or past its expiry.
  get(chainId: bigint, ethAddr: string, now = Date.now()): string | undefined {
    const entry = readJson(localStore, this.key(chainId, ethAddr), isCacheEntry);
    if (!entry) return undefined;
    return now < entry.expiresAt ? entry.token : undefined;
  },

  set(chainId: bigint, ethAddr: string, token: string, now = Date.now()): void {
    writeJson(localStore, this.key(chainId, ethAddr), {
      token,
      expiresAt: now + jitter(CACHE_TTL_MS),
    });
  },

  clear(chainId: bigint, ethAddr: string): void {
    localStore.remove(this.key(chainId, ethAddr));
  },
};

interface CacheEntry {
  token: string;
  expiresAt: number;
}

function isCacheEntry(value: unknown): value is CacheEntry {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.token === "string" && typeof r.expiresAt === "number";
}

/// Forget the subscription registered for `ethAddr` (claim links leave no trace).
export function clearCachedSubscription(chainId: bigint, ethAddr: string): void {
  tokenCache.clear(chainId, ethAddr);
}

/// Largest γ keeping `noteCount` above the decoy floor, capped at the sender's γ; 0 means do not subscribe.
export function maxDetectionGamma(noteCount: number): number {
  if (noteCount < DECOY_FLOOR * 2 ** GAMMA_MIN) return 0;
  return Math.min(FMD_DEFAULT_GAMMA, Math.floor(Math.log2(noteCount / DECOY_FLOOR)));
}

/// Why the wallet takes the full note firehose: `poolTooSmall` is cheap, `unavailable` may not be.
export type FullSyncReason = "poolTooSmall" | "unavailable";

/// The chosen strategy, plus why it was chosen when it is the fallback.
export interface SyncPlan {
  strategy: SyncStrategy;
  fallback?: FullSyncReason;
}

/// Pick the note-sync strategy: FMD matches when subscribed, else the full firehose.
export async function resolveSyncStrategy(
  fmdUrl: string,
  chainId: bigint,
  nsk: Field,
  ethAddr: string,
): Promise<SyncPlan> {
  try {
    const token = await ensureFmdSubscription(fmdUrl, chainId, nsk, ethAddr);
    if (token === undefined) return { strategy: { kind: "full" }, fallback: "poolTooSmall" };
    return { strategy: { kind: "matches", token } };
  } catch (e) {
    log.warn("FMD subscription unavailable; falling back to full note sync", e);
    return { strategy: { kind: "full" }, fallback: "unavailable" };
  }
}

/// Ensure an FMD subscription exists and return its token, or `undefined` below the decoy floor.
async function ensureFmdSubscription(
  fmdUrl: string,
  chainId: bigint,
  nsk: Field,
  ethAddr: string,
): Promise<string | undefined> {
  const { P, J } = await cryptoContext();
  const { keys } = await deriveKeysFromNsk(nsk, { P, J });
  const tokenHex = subscriptionTokenToHex(deriveSubscriptionToken(P, keys.ivk));

  if (tokenCache.get(chainId, ethAddr) === tokenHex) {
    log.debug("cache hit");
    return tokenHex;
  }

  const fmd = new FmdClient(fmdUrl, chainId);

  // γ must be settled first: the server pins a subscription to its detection key.
  const { leafCount } = await fmd.fetchTreeState();
  const gamma = maxDetectionGamma(leafCount);
  if (gamma < GAMMA_MIN) {
    log.info("pool below the decoy floor; taking the firehose instead of subscribing", {
      leafCount,
      required: DECOY_FLOOR * 2 ** GAMMA_MIN,
    });
    return undefined;
  }

  const detectionKeyHex = detectionKeyToHex(detectionKeyFor(J, P, keys, gamma));
  const sub = await fmd.createSubscription({ detectionKeyHex, gamma, tokenHex });
  log.info(sub.created ? "created sub" : "reused server-side sub", {
    gamma: sub.gamma,
    active: sub.active,
    leafCount,
  });
  // An inactive subscription fails silently (empty pages, zero balance), so throw to take the firehose.
  if (!sub.active) {
    tokenCache.clear(chainId, ethAddr);
    throw new Error("FMD subscription is not active");
  }
  tokenCache.set(chainId, ethAddr, tokenHex);
  return tokenHex;
}
