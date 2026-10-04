import { isMobileBrowser } from "@/shared/lib/platform";

/// The link that reopens this page in MetaMask's in-app browser, the one place its provider is injected on a phone.
/// Undefined off mobile, and off https: the link can only open an https origin.
export function metamaskDappLink(): string | undefined {
  if (typeof window === "undefined" || !isMobileBrowser()) return undefined;
  const { protocol, host, pathname } = window.location;
  if (protocol !== "https:") return undefined;
  return `https://metamask.app.link/dapp/${host}${pathname}`;
}
