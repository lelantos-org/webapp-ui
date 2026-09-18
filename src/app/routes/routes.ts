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

/// `lazy()` over a module's named export.
export function lazyNamed<K extends string, P extends object>(
  load: () => Promise<Record<K, ComponentType<P>>>,
  name: K,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}

interface ActionRoute {
  path: string;
  width: NonNullable<ActionScreenProps["width"]>;
  load: () => Promise<unknown>;
  prefetch: boolean;
  Screen: LazyExoticComponent<ComponentType>;
}

function action<K extends string>(
  path: string,
  width: ActionRoute["width"],
  load: () => Promise<Record<K, ComponentType>>,
  screen: K,
  prefetch: boolean,
): ActionRoute {
  return { path, width, load, prefetch, Screen: lazyNamed(load, screen) };
}

/// The action routes, each rendered inside `ActionScreen`.
export const ACTIONS: readonly ActionRoute[] = [
  action("/shield", "narrow", loadShield, "DepositForm", true),
  action("/send", "narrow", loadSend, "TransferForm", true),
  action("/send/link", "wide", loadSendLink, "GenerateLinkForm", true),
  action("/unshield", "narrow", loadUnshield, "WithdrawForm", true),
  action("/swap", "narrow", loadSwap, "SwapForm", true),
  action("/links", "vault", loadLinks, "LinksPage", false),
  action("/governance", "vault", loadGovernance, "ProposalsPage", true),
  action("/governance/new", "wide", loadGovernance, "CreateProposalPage", false),
  action("/governance/:id", "vault", loadGovernance, "ProposalDetailPage", false),
  action("/agents", "vault", loadAgents, "AgentsPage", true),
  action("/agents/new", "narrow", loadAgents, "NewAgentForm", false),
];

/// Route chunks behind each Home tile, keyed by path.
export const ACTION_PREFETCH: Readonly<Record<string, () => Promise<unknown>>> = Object.fromEntries(
  ACTIONS.filter((a) => a.prefetch).map((a) => [a.path, a.load]),
);
