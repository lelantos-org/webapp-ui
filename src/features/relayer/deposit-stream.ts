// Per-chain registry over the SDK's `DepositStream`. The stream itself is a
// long-lived SSE subscription, so the app keeps one per chain rather than
// opening a source per deposit.

import { DepositStream } from "@lelantos-org/sdk/relayer";
import { env } from "@/config/env";

const streams = new Map<bigint, DepositStream>();

/// The open stream for `chainId`, opening one if needed.
///
/// A closed stream is replaced rather than reused: the transport gives up
/// permanently on a fatal error (a relayer without the endpoint answers 404),
/// so reusing it would report every later deposit as unobserved for the rest
/// of the page's life. Reopening costs one request and recovers if the
/// relayer comes back.
export function depositStream(chainId: bigint): DepositStream {
  const open = streams.get(chainId);
  if (open && !open.isClosed) return open;
  const fresh = new DepositStream(env.relayerUrl, chainId);
  streams.set(chainId, fresh);
  return fresh;
}

/// Open the stream ahead of submitting a deposit, so the connection is live
/// before the relayer can publish its flush event.
export function preopenDepositStream(chainId: bigint): void {
  depositStream(chainId);
}

/// Release every stream. Call when the wallet goes away.
export function closeDepositStreams(): void {
  for (const stream of streams.values()) stream.close();
  streams.clear();
}

/// Drop the streams for every chain but `chainId`. Call on a chain switch:
/// the old chain's SSE connection is held open for the life of the page
/// otherwise, and nothing is left watching it for flush events.
export function closeDepositStreamsExcept(chainId: bigint): void {
  for (const [id, stream] of streams) {
    if (id === chainId) continue;
    stream.close();
    streams.delete(id);
  }
}
