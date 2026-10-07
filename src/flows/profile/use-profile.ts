import { useQueryClient } from "@tanstack/react-query";
import { useChainRegistry, useEarlyChainRegistry } from "@/features/chain";
import { readHandle, registrarChain, useNameRecord } from "@/features/names";
import { queryKeys } from "@/shared/query/keys";
import { type ProfileView, payableView, profileView } from "./profile-view";
import { useHandleFragment } from "./use-handle-fragment";
import { usePayableAddress } from "./use-payable-address";

export interface Profile {
  view: ProfileView;
  /// The fragment as written.
  typed: string;
  /// The handle as displayed; `undefined` unless the fragment names one that is served.
  name: string | undefined;
  /// The network whose registrar is read; `undefined` while none is known.
  chainName: string | undefined;
  /// The parents that network serves handles under.
  parents: readonly string[];
  retryRecord(): void;
  retryNetworks(): void;
}

/// The profile the URL fragment names. It needs no wallet, and reads the handle on the chain that
/// runs a registrar, whatever chain a connected wallet is on.
export function useProfile(): Profile {
  const typed = useHandleFragment();
  // A visitor has no wallet connected, and the registry is otherwise fetched on connect.
  const networks = useEarlyChainRegistry(true);
  const chain = registrarChain(useChainRegistry());
  const parents = chain?.nameParents ?? [];
  const read = chain ? readHandle(typed, parents) : undefined;
  const handle = read?.ok ? read.value : undefined;
  const record = useNameRecord(chain, handle?.label);
  const published = profileView({
    read,
    networks,
    record: { data: record.data, failed: record.isError },
  });
  // The record's shape is checked at once; whether the address decodes is checked by the SDK.
  const payable = usePayableAddress(published.kind === "ready" ? published.address : undefined);
  const qc = useQueryClient();

  return {
    view: payableView(published, payable),
    typed,
    name: handle?.name,
    chainName: chain?.chainName,
    parents,
    retryRecord: () => void record.refetch(),
    retryNetworks: () => void qc.refetchQueries({ queryKey: queryKeys.chainRegistry() }),
  };
}
