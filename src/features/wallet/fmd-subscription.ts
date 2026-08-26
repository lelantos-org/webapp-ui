import type { SyncStrategy } from "@lelantos-org/sdk";
import { cryptoContext, deriveSubscriptionToken, type Field } from "@lelantos-org/sdk/crypto";
import {
  detectionKeyToHex,
  FMD_DEFAULT_GAMMA,
  subscriptionTokenToHex,
} from "@lelantos-org/sdk/fmd";
import { FmdClient, GAMMA_MIN } from "@lelantos-org/sdk/fmd-server";
import { deriveKeysFromNsk, detectionKeyFor } from "@lelantos-org/sdk/keys";
import { jitter } from "@/shared/lib/activity";
import { createLogger } from "@/shared/lib/logger";
import { localStore, readJson, writeJson } from "@/shared/lib/storage";
import { accountDigest } from "@/shared/lib/storage-digest";

const log = createLogger("fmd-sub");
// Namespaced by cache format; entries hold the capability token addressing the
// subscription. The address is digested rather than spelled out, so the key
// names do not enumerate the accounts this browser has connected — see
// `accountDigest`. A miss costs one idempotent POST.
const PREFIX = "lelantos:fmd-sub:v3:";

/// Decoys a match set is expected to retain, mirroring the server's
/// `MIN_EXPECTED_DECOYS`. A γ is acceptable while `noteCount * 2^-γ` stays at or
/// above this.
///
/// The server does not reject a pool below the floor: it clamps its advertised
/// ceiling to `GAMMA_MIN` and accepts γ=1 at any note count. This client is
/// stricter, because at γ=1 the match set is half the pool, so registering one
/// reveals more to the discovery service than taking the firehose. See
/// `maxDetectionGamma`.
const DECOY_FLOOR = 64;

/// Per-(chain, address) memo of the subscription token last confirmed with the
/// server, and when.
///
/// The token is a pure function of the wallet key and never changes, but the
/// subscription it addresses can expire or be revoked server-side. This is
/// therefore a hint with an expiry: past the TTL the token is re-confirmed
/// through the idempotent create call. Trusting it indefinitely would turn an
/// expired subscription into a silent zero balance, since an inactive
/// subscription answers `listNotes` with an empty page rather than an error.
///
/// Grouped into one object so the token and its expiry are written, read and
/// cleared together.
const tokenCache = {
  key: (chainId: bigint, ethAddr: string) =>
    `${PREFIX}${chainId.toString(16)}:${accountDigest(ethAddr)}`,

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

/// Nominal lifetime of a cached token before it is re-confirmed with the server,
/// at a cost of one idempotent POST per day.
///
/// Jittered once at write time into the entry's `expiresAt`. An exact 24h TTL
/// would land the re-confirm at the same wall-clock offset every day, a
/// per-wallet schedule the discovery service could recognise without reading the
/// token. Jittering at comparison time instead would re-roll the deadline on
/// every read, letting one entry answer "valid" and then "expired" microseconds
/// apart.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  token: string;
  /// Absolute deadline rather than a write timestamp, so the jitter is applied
  /// once and the entry's lifetime is fixed.
  expiresAt: number;
}

function isCacheEntry(value: unknown): value is CacheEntry {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.token === "string" && typeof r.expiresAt === "number";
}

/// Forget the subscription registered for `ethAddr`.
///
/// Exported for the claim flow: a one-shot link should not leave a permanent
/// entry tying its ephemeral address to this browser.
export function clearCachedSubscription(chainId: bigint, ethAddr: string): void {
  tokenCache.clear(chainId, ethAddr);
}

/// Largest γ keeping `noteCount` above the decoy floor, capped at the sender's
/// γ. Returns 0 when the pool is too small for any acceptable value.
///
/// Detecting below the sender's γ is lossless, widening the match set only, so
/// trimming γ costs bandwidth rather than notes.
///
/// Agrees with the server's `max_gamma_for` at every pool size at or above
/// `DECOY_FLOOR * 2 ** GAMMA_MIN`. Below that the server clamps to `GAMMA_MIN`
/// while this returns 0, meaning "do not subscribe" rather than "subscribe at
/// the weakest γ".
export function maxDetectionGamma(noteCount: number): number {
  if (noteCount < DECOY_FLOOR * 2 ** GAMMA_MIN) return 0;
  return Math.min(FMD_DEFAULT_GAMMA, Math.floor(Math.log2(noteCount / DECOY_FLOOR)));
}

/// Why the wallet is taking the full note firehose instead of FMD matches.
///
/// The two differ greatly in cost. `poolTooSmall` is bounded by the decoy floor:
/// fewer than `DECOY_FLOOR * 2 ** GAMMA_MIN` notes exist to scan, so the
/// firehose is cheap. `unavailable` has no such bound and, on a full-sized pool,
/// means trial-decrypting every note in the system.
export type FullSyncReason = "poolTooSmall" | "unavailable";

/// The chosen strategy, plus why it was chosen when it is the fallback.
export interface SyncPlan {
  strategy: SyncStrategy;
  /// Absent on the `matches` path.
  fallback?: FullSyncReason;
}

/// Pick the note-sync strategy for this wallet.
///
/// Prefers server-side FMD filtering, which requires a subscription. The γ
/// ceiling is server policy rather than a client-side invariant, so a rejected
/// or unreachable subscription degrades to the full note firehose: slower, but
/// correct and more private.
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

/// Ensure an FMD subscription exists for the wallet's detection key; returns
/// the capability token addressing it, or `undefined` when the pool is below
/// the decoy floor and no subscription should exist yet.
///
/// `undefined` rather than a throw: a pool below the floor is the ordinary state
/// of a new deployment, and conflating it with an unreachable discovery service
/// would stop the caller distinguishing a cheap fallback from an expensive one.
///
/// The token is derived from `ivk` at the default epoch, making it a pure
/// function of the wallet key. The cache only avoids a redundant POST; losing it
/// costs one idempotent re-registration.
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

  // The detection key is γ-dependent, and the server pins a subscription to
  // the key it was created with, so γ has to be settled before registering.
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
  // An inactive subscription is unusable and, unlike an unreachable server,
  // fails silently: `listNotes` returns an empty page, the sync reports
  // `exhausted` with zero hits, and the UI shows "synced just now" beside a zero
  // balance. Throwing routes it to the `unavailable` fallback, which takes the
  // firehose and warns.
  if (!sub.active) {
    tokenCache.clear(chainId, ethAddr);
    throw new Error("FMD subscription is not active");
  }
  tokenCache.set(chainId, ethAddr, tokenHex);
  return tokenHex;
}
