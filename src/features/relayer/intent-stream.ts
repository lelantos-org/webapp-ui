// SSE subscriber for relayer-side intent lifecycle events. One shared,
// always-on `EventSource` per chain id (opened lazily, never closed).
// The ring buffer of recent events closes the race where `awaitFlush`
// subscribes after the relayer has published — the stream doesn't replay.

import { env } from "@/config/env";

interface FlushedEvent {
  kind: "flushed";
  intent_id: number | string;
  chain_id: number;
  tx_hash: string;
  block_number: number;
}

type IntentEvent = FlushedEvent;

type Listener = (ev: IntentEvent) => void;

interface Subscription {
  source: EventSource;
  listeners: Set<Listener>;
  recent: IntentEvent[];
}

const subs = new Map<bigint, Subscription>();
const RECENT_CAP = 64;

function streamUrl(chainId: bigint): string {
  const base = env.relayerUrl.replace(/\/$/, "");
  return `${base}/v1/intents/stream?chain_id=${chainId.toString()}`;
}

/// Subscribe to (or attach to the existing) SSE source for `chainId`.
/// `replay` fires once per cached event so callers can match a flush
/// that arrived between submit and subscribe.
function acquire(chainId: bigint, replay: Listener): Subscription {
  const existing = subs.get(chainId);
  if (existing) {
    for (const ev of existing.recent) replay(ev);
    return existing;
  }
  const source = new EventSource(streamUrl(chainId));
  const sub: Subscription = { source, listeners: new Set(), recent: [] };
  source.onmessage = (e) => {
    let ev: IntentEvent;
    try {
      ev = JSON.parse(e.data) as IntentEvent;
    } catch {
      return;
    }
    sub.recent.push(ev);
    if (sub.recent.length > RECENT_CAP) sub.recent.shift();
    for (const l of sub.listeners) l(ev);
  };
  subs.set(chainId, sub);
  return sub;
}

function detach(sub: Subscription, listener: Listener): void {
  sub.listeners.delete(listener);
}

/// Eagerly open the SSE source for `chainId`. Call when a deposit is
/// about to be submitted so the connection is live before the relayer
/// can publish its flush event. No-op if already open.
export function preopenIntentStream(chainId: bigint): void {
  acquire(chainId, () => {});
}

/// Resolve when a `Flushed` event for `intentId` on `chainId` arrives.
/// Aborts (rejects with `AbortError`) when `signal` fires.
export function awaitFlush(
  chainId: bigint,
  intentId: bigint,
  signal: AbortSignal,
): Promise<{ txHash: string; blockNumber: number }> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException("aborted", "AbortError"));
      return;
    }
    const target = intentId.toString();
    let settled = false;
    const tryMatch = (ev: IntentEvent): boolean => {
      if (settled) return true;
      if (ev.kind !== "flushed") return false;
      if (BigInt(ev.intent_id).toString() !== target) return false;
      settled = true;
      cleanup();
      resolve({ txHash: ev.tx_hash, blockNumber: ev.block_number });
      return true;
    };
    const onEvent: Listener = (ev) => {
      tryMatch(ev);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(signal.reason ?? new DOMException("aborted", "AbortError"));
    };
    let sub: Subscription | undefined;
    function cleanup() {
      if (sub) detach(sub, onEvent);
      signal.removeEventListener("abort", onAbort);
    }
    // `acquire` replays cached recent events synchronously — match early.
    sub = acquire(chainId, (ev) => tryMatch(ev));
    if (settled) return;
    sub.listeners.add(onEvent);
    signal.addEventListener("abort", onAbort);
  });
}
