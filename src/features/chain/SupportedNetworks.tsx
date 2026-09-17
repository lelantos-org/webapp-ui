import type { ChainEntry } from "@/config/chains";
import { ChainIcon } from "@/shared/ui/icons/ChainIcon";
import { useChainRegistry } from "./ChainProvider";
import "./SupportedNetworks.css";

/// The served networks, shown before connecting from the registry an earlier session cached.
export function SupportedNetworks() {
  const registry = useChainRegistry();
  if (registry.length === 0) return null;

  return (
    <div className="networks">
      <span className="networks__label">Available on</span>
      {registry.map((c: ChainEntry) => (
        <span
          key={c.chainId.toString()}
          className="pill networks__pill"
          title={`chain id ${c.chainId}`}
        >
          <ChainIcon chainId={c.chainId} chainName={c.chainName} className="networks__mark" />
          {c.chainName}
        </span>
      ))}
    </div>
  );
}
