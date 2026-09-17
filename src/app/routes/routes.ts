import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import type { ActionScreenProps } from "@/app/shell/ActionScreen";
import {
  loadGovernance,
  loadLinks,
  loadSend,
  loadSendLink,
  loadShield,
  loadSwap,
  loadUnshield,
} from "@/flows/loaders";

/// `lazy()` over a module's named export: the routes' modules export their
/// screen by name, not as a default.
export function lazyNamed<K extends string, P extends object>(
  load: () => Promise<Record<K, ComponentType<P>>>,
  name: K,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}

interface ActionRoute {
  path: string;
  width: NonNullable<ActionScreenProps["width"]>;
  /// The route's chunk. Home warms it on intent and again at idle when
  /// `prefetch` is set; `App` lazy-loads `Screen` through the same loader, so a
  /// warmed chunk is the route's.
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

/// The action screens, each its own route in the same shell: the connection
/// gate, the chain-keyed remount, the chunk fallback. See `ActionScreen`.
export const ACTIONS: readonly ActionRoute[] = [
  action("/shield", "narrow", loadShield, "DepositForm", true),
  action("/send", "narrow", loadSend, "TransferForm", true),
  action("/send/link", "wide", loadSendLink, "GenerateLinkForm", true),
  action("/unshield", "narrow", loadUnshield, "WithdrawForm", true),
  action("/swap", "narrow", loadSwap, "SwapForm", true),
  action("/links", "vault", loadLinks, "LinksPage", false),
  action("/governance", "vault", loadGovernance, "ProposalsPage", true),
  // Static before dynamic is react-router's own ranking; listed in that order
  // anyway so the table reads the way it matches.
  action("/governance/new", "wide", loadGovernance, "CreateProposalPage", false),
  action("/governance/:id", "vault", loadGovernance, "ProposalDetailPage", false),
];

/// Route chunks behind each Home tile, keyed by path.
export const ACTION_PREFETCH: Readonly<Record<string, () => Promise<unknown>>> = Object.fromEntries(
  ACTIONS.filter((a) => a.prefetch).map((a) => [a.path, a.load]),
);
