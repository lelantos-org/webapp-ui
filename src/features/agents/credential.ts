// The credential an operator hands to an agent, as JSON or `.env`: the chain and
// key the agent passes to `connect({ nsk, network, rpcUrl })`, and the address the
// operator tops up.
//
// Nothing here writes the credential to disk; it leaves through the clipboard.
// The key is masked unless `reveal` is set.

import type { StoredAgent } from "./record";

export interface AgentCredential {
  chainId: string;
  address: string;
  nsk: string;
}

function credentialOf(agent: StoredAgent): AgentCredential {
  return { chainId: agent.chainId, address: agent.address, nsk: agent.nsk };
}

function asJson(agent: StoredAgent): string {
  return `${JSON.stringify(credentialOf(agent), null, 2)}\n`;
}

function asEnv(agent: StoredAgent): string {
  return [
    `# ${agent.label} — this key can spend everything the agent holds`,
    `LELANTOS_CHAIN_ID=${agent.chainId}`,
    `LELANTOS_ADDRESS=${agent.address}`,
    `LELANTOS_NSK=${agent.nsk}`,
    "",
  ].join("\n");
}

export type CredentialFormat = "json" | "env";

/// Mask shown while the key is hidden. Fixed-width, so no key characters are displayed.
const MASK = "\u2022".repeat(24);

export interface RenderOptions {
  /// Show the key. Off by default: the panel may be on a shared screen.
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
