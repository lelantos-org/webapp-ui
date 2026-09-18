// What the operator hands to the agent.
//
// An agent runs `connect({ nsk, network, rpcUrl })`, so the chain and the key are
// the whole credential; the address is included because it is what the operator
// tops up, and a process that logs where it is funded should not have to derive
// it. Two renderings of the same three fields — JSON for a config file, `.env`
// for a process — because which one is convenient depends on how the agent runs.
//
// Neither is written to disk from here. The credential leaves through the
// clipboard, which keeps it out of the downloads folder, where a spending key is
// easy to forget.
//
// The key is masked unless asked for. Copying does not need it on screen, and
// the panel appears right after funding — often with someone watching, or a
// screen being shared.

import type { StoredAgent } from "./record";

export interface AgentCredential {
  chainId: string;
  address: string;
  nsk: string;
}

export function credentialOf(agent: StoredAgent): AgentCredential {
  return { chainId: agent.chainId, address: agent.address, nsk: agent.nsk };
}

export function asJson(agent: StoredAgent): string {
  return `${JSON.stringify(credentialOf(agent), null, 2)}\n`;
}

export function asEnv(agent: StoredAgent): string {
  return [
    `# ${agent.label} — this key can spend everything the agent holds`,
    `LELANTOS_CHAIN_ID=${agent.chainId}`,
    `LELANTOS_ADDRESS=${agent.address}`,
    `LELANTOS_NSK=${agent.nsk}`,
    "",
  ].join("\n");
}

export type CredentialFormat = "json" | "env";

/**
 * Stand-in for the key while it is hidden.
 *
 * A fixed mask rather than a truncation: a few leading hex characters would
 * still be a few characters of a spending key, and the address above it is
 * already enough to tell one agent from another.
 */
const MASK = "\u2022".repeat(24);

export interface RenderOptions {
  /// Show the key itself. Off by default: the panel is often on a shared screen.
  reveal?: boolean;
}

export function render(
  agent: StoredAgent,
  format: CredentialFormat,
  opts: RenderOptions = {},
): string {
  const shown = opts.reveal ? agent : { ...agent, nsk: MASK };
  return format === "json" ? asJson(shown) : asEnv(shown);
}
