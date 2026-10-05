import { createStore, useStore } from "@/shared/lib/external-store";

const store = createStore(false);

/// Show the endpoint settings. Kept here so the header and the account menu both reach it.
export function openEndpointsDialog(): void {
  store.setState(true);
}

export function closeEndpointsDialog(): void {
  store.setState(false);
}

export function useEndpointsDialogOpen(): boolean {
  return useStore(store);
}
