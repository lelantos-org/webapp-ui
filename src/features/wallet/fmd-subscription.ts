import {
  buildJubjub,
  deriveKeysFromNsk,
  detectionKeyToHex,
  type Field,
  FmdClient,
  flagKeyFromAddressDk,
} from "@lelantos-org/sdk";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("fmd-sub");
const PREFIX = "sswap:fmd-sub:";

function key(chainId: bigint, ethAddr: string): string {
  return `${PREFIX}${chainId.toString(16)}:${ethAddr.toLowerCase()}`;
}

function readCached(chainId: bigint, ethAddr: string): number | undefined {
  try {
    const raw = localStorage.getItem(key(chainId, ethAddr));
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

function writeCached(chainId: bigint, ethAddr: string, id: number): void {
  try {
    localStorage.setItem(key(chainId, ethAddr), String(id));
  } catch (e) {
    log.warn("persist failed", e);
  }
}

/// Ensure an FMD subscription exists for the wallet's deterministic detection
/// key; returns its id.
export async function ensureFmdSubscription(
  fmdUrl: string,
  chainId: bigint,
  nsk: Field,
  ethAddr: string,
): Promise<number> {
  const cached = readCached(chainId, ethAddr);
  if (cached !== undefined) {
    log.debug("cache hit", cached);
    return cached;
  }

  const J = await buildJubjub();
  const { keys } = await deriveKeysFromNsk(nsk, { J });
  const { detection } = flagKeyFromAddressDk(J, keys.dk);
  const detectionKeyHex = detectionKeyToHex(detection);
  const gamma = detection.x.length;

  const fmd = new FmdClient(fmdUrl, chainId);
  const existing = (await fmd.listSubscriptions()).find(
    (s) => s.detectionKeyHex === detectionKeyHex && s.active,
  );
  const sub = existing ?? (await fmd.createSubscription({ detectionKeyHex, gamma }));
  log.info(existing ? "reused server-side sub" : "created sub", sub.id);
  writeCached(chainId, ethAddr, sub.id);
  return sub.id;
}
