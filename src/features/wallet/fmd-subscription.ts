import type { SyncStrategy } from "@lelantos-org/sdk";
import { cryptoContext, deriveSubscriptionToken, type Field } from "@lelantos-org/sdk/crypto";
import {
  detectionKeyToHex,
  FMD_DEFAULT_GAMMA,
  subscriptionTokenToHex,
} from "@lelantos-org/sdk/fmd";
import { FmdClient, GAMMA_MIN } from "@lelantos-org/sdk/fmd-server";
import { deriveKeysFromNsk, detectionKeyFor } from "@lelantos-org/sdk/keys";
import { createLogger } from "@/shared/lib/logger";
import { localStore, readJson, writeJson } from "@/shared/lib/storage";

const log = createLogger("fmd-sub");
// Namespaced by cache format: entries hold the capability token that
// addresses the subscription.
const PREFIX = "lelantos:fmd-sub:v2:";

/// Decoys a match set is expected to retain, mirroring the server's
/// `MIN_EXPECTED_DECOYS`. A γ is acceptable while `noteCount * 2^-γ` stays at
/// or above this.
///
/// The server does not *reject* a pool below the floor — it clamps its
/// advertised ceiling to `GAMMA_MIN` and accepts γ=1 at any note count,
/// including zero. This client is deliberately stricter: at γ=1 the match set
/// is half the pool, so registering one tells the discovery service that the
/// wallet's notes are among those — for a pool this small, weaker than
/// telling it nothing and taking the firehose. See `maxDetectionGamma`.
const DECOY_FLOOR = 64;

/// Per-(chain, address) memo of the subscription token last confirmed with the
/// server, and when.
///
/// The token itself is a pure function of the wallet key and never changes; the
/// *subscription* it addresses can expire or be revoked server-side. So this is
/// a hint with an expiry, not an answer: past the TTL the token is re-confirmed
/// through the idempotent create call. Trusting it indefinitely turned an
/// expired subscription into a permanent, silent zero balance, because an
/// inactive subscription answers `listNotes` with an empty page rather than an
/// error.
///
/// Grouped into one object so the value key and its timestamp key cannot drift
/// apart — they are written, read and cleared together or not at all.
const tokenCache = {
  key: (chainId: bigint, ethAddr: string) =>
    `${PREFIX}${chainId.toString(16)}:${ethAddr.toLowerCase()}`,

  /// The cached token, or `undefined` if absent or past the TTL.
  get(chainId: bigint, ethAddr: string, now = Date.now()): string | undefined {
    const entry = readJson(localStore, this.key(chainId, ethAddr), isCacheEntry);
    if (!entry) return undefined;
    return now - entry.confirmedAt < CACHE_TTL_MS ? entry.token : undefined;
  },

  set(chainId: bigint, ethAddr: string, token: string): void {
    writeJson(localStore, this.key(chainId, ethAddr), { token, confirmedAt: Date.now() });
  },

  clear(chainId: bigint, ethAddr: string): void {
    localStore.remove(this.key(chainId, ethAddr));
  },
};

/// How long a cached token is trusted without re-confirming it with the server.
/// Re-confirming costs one idempotent POST per day.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  token: string;
  confirmedAt: number;
}

function isCacheEntry(value: unknown): value is CacheEntry {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.token === "string" && typeof r.confirmedAt === "number";
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
/// Detecting below the sender's γ is lossless — it only widens the match set —
/// so trimming γ costs bandwidth, never notes.
///
/// Agrees with the server's `max_gamma_for` at every pool size at or above
/// `DECOY_FLOOR * 2 ** GAMMA_MIN`. Below that the server clamps to `GAMMA_MIN`
/// while this returns 0, which is the one intentional divergence: a 0 means
/// "do not subscribe at all" rather than "subscribe at the weakest γ".
export function maxDetectionGamma(noteCount: number): number {
  if (noteCount < DECOY_FLOOR * 2 ** GAMMA_MIN) return 0;
  return Math.min(FMD_DEFAULT_GAMMA, Math.floor(Math.log2(noteCount / DECOY_FLOOR)));
}

/// Why the wallet is taking the full note firehose instead of FMD matches.
///
/// Worth distinguishing because the two cost wildly different amounts.
/// `poolTooSmall` is bounded by the decoy floor itself — fewer than
/// `DECOY_FLOOR * 2 ** GAMMA_MIN` notes exist to scan, so the firehose is
/// effectively free. `unavailable` carries no such bound: on a full-sized pool
/// it means trial-decrypting every note in the system.
export type FullSyncReason = "poolTooSmall" | "unavailable";

/// The chosen strategy, plus why it was chosen when it is the fallback.
export interface SyncPlan {
  strategy: SyncStrategy;
  /// Absent on the `matches` path.
  fallback?: FullSyncReason;
}

/// Pick the note-sync strategy for this wallet.
///
/// Prefers server-side FMD filtering, which needs a subscription. The exact γ
/// ceiling is the server's policy rather than a client-side invariant, so a
/// rejected or unreachable subscription degrades to the full note firehose:
/// slower, but correct and strictly more private.
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
/// `undefined` rather than a throw: a pool that has not grown to the floor is
/// the ordinary state of a new deployment, not a failure, and conflating it
/// with an unreachable discovery service costs the caller the ability to tell
/// a free fallback from a ruinous one.
///
/// The token is derived from `ivk` at the default epoch, making it a pure
/// function of the wallet key. The cache only avoids a redundant POST;
/// losing it costs one idempotent re-registration.
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
  // An inactive subscription is not usable, and — unlike an unreachable server
  // — it fails silently: `listNotes` returns an empty page, the sync reports
  // `exhausted` with zero hits, and the user is shown a healthy "synced just
  // now" beside a zero balance. Throwing routes it to the `unavailable`
  // fallback, which takes the firehose and warns.
  if (!sub.active) {
    tokenCache.clear(chainId, ethAddr);
    throw new Error("FMD subscription is not active");
  }
  tokenCache.set(chainId, ethAddr, tokenHex);
  return tokenHex;
}
