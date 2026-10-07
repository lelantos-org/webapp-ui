import { createPublicClient, http, type PublicClient } from "viem";
import type { ChainEntry } from "@/config/chains";

const clients = new Map<string, PublicClient>();

/// One client per read endpoint, shared by every registrar read on it. It carries no account.
export function namesClient(chain: Pick<ChainEntry, "readRpcUrl">): PublicClient {
  let client = clients.get(chain.readRpcUrl);
  if (!client) {
    client = createPublicClient({ transport: http(chain.readRpcUrl) });
    clients.set(chain.readRpcUrl, client);
  }
  return client;
}
