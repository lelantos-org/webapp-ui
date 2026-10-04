import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import type { ActionScreenProps } from "@/app/shell/ActionScreen";
import {
  loadAgents,
  loadGovernance,
  loadLinks,
  loadSend,
  loadSendLink,
  loadShield,
  loadSwap,
  loadUnshield,
} from "@/flows/loaders";

export function lazyNamed<K extends string, P extends object>(
  load: () => Promise<Record<K, ComponentType<P>>>,
  name: K,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}

interface ActionRoute {
  path: string;
  /// Names the screen in the document title.
  title: string;
  width: ActionScreenProps["width"];
  load: () => Promise<unknown>;
  prefetch: boolean;
  Screen: LazyExoticComponent<ComponentType>;
}

function action<K extends string>(
  path: string,
  title: string,
  width: ActionRoute["width"],
  load: () => Promise<Record<K, ComponentType>>,
  screen: K,
  prefetch: boolean,
): ActionRoute {
  return { path, title, width, load, prefetch, Screen: lazyNamed(load, screen) };
}

/// The action routes, each rendered inside `ActionScreen`.
export const ACTIONS: readonly ActionRoute[] = [
  action("/shield", "Shield", "narrow", loadShield, "DepositForm", true),
  action("/send", "Send", "narrow", loadSend, "TransferForm", true),
  action("/send/link", "Send by link", "wide", loadSendLink, "GenerateLinkForm", true),
  action("/unshield", "Unshield", "narrow", loadUnshield, "WithdrawForm", true),
  action("/swap", "Swap", "narrow", loadSwap, "SwapForm", true),
  action("/links", "Links", "vault", loadLinks, "LinksPage", false),
  action("/governance", "Governance", "vault", loadGovernance, "ProposalsPage", true),
  action("/governance/new", "New proposal", "wide", loadGovernance, "CreateProposalPage", false),
  action("/governance/:id", "Proposal", "vault", loadGovernance, "ProposalDetailPage", false),
  action("/agents", "Agents", "vault", loadAgents, "AgentsPage", true),
  action("/agents/new", "Fund an agent", "narrow", loadAgents, "NewAgentForm", false),
];

/// Route chunks behind each Home tile, keyed by path.
export const ACTION_PREFETCH: Readonly<Record<string, () => Promise<unknown>>> = Object.fromEntries(
  ACTIONS.filter((a) => a.prefetch).map((a) => [a.path, a.load]),
);
