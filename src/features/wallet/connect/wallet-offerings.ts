import {
  type Eip6963ProviderDetail,
  preferredRdns,
  storedCredential,
  WALLET_KINDS,
  type WalletKind,
} from "@/features/wallet-kinds";

/// One picker row; `id` is the `rdns` for an injected wallet, else the kind's name. `icon` is untrusted.
export type WalletChoice =
  | { kind: "eip1193"; id: string; name: string; icon: string }
  | { kind: Exclude<WalletKind, "eip1193">; id: string; name: string };

/// Whether the passkey row leads: it is the only phishing-resistant path, unless the user already chose an extension.
function preferPasskey(): boolean {
  if (storedCredential() !== undefined) return true;
  return preferredRdns() === undefined;
}

/// The rows to offer, in picker order.
export function offerings(discovered: Eip6963ProviderDetail[]): WalletChoice[] {
  const injected: WalletChoice[] = preferredFirst(discovered, preferredRdns()).map((d) => ({
    kind: "eip1193",
    id: d.info.rdns,
    name: d.info.name,
    icon: d.info.icon,
  }));

  const others: WalletChoice[] = WALLET_KINDS.flatMap((a) =>
    a.kind !== "eip1193" && a.available()
      ? [{ kind: a.kind, id: a.kind, name: a.copy.label() }]
      : [],
  );

  const passkey = others.filter((c) => c.kind === "passkey");
  const rest = others.filter((c) => c.kind !== "passkey");

  return passkey.length > 0 && preferPasskey()
    ? [...passkey, ...injected, ...rest]
    : [...injected, ...passkey, ...rest];
}

function preferredFirst(
  list: Eip6963ProviderDetail[],
  preferred: string | undefined,
): Eip6963ProviderDetail[] {
  if (!preferred) return list;
  const wanted = preferred.toLowerCase();
  const isPreferred = (d: Eip6963ProviderDetail) => d.info.rdns.toLowerCase() === wanted;
  return [...list.filter(isPreferred), ...list.filter((d) => !isPreferred(d))];
}
