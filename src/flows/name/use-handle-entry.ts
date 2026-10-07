import { useState } from "react";
import type { ChainEntry } from "@/config/chains";
import { type Handle, readHandle, useNameAvailable } from "@/features/names";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { type HandleStatus, handleStatus } from "./handle-status";

/// How long typing must pause before the registrar is asked about a label.
const CHECK_DEBOUNCE_MS = 350;

export interface HandleEntry {
  text: string;
  setText(text: string): void;
  /// The handle the text names; `undefined` unless it is one `chain` serves.
  handle: Handle | undefined;
  status: HandleStatus;
  /// Asks the registrar again after a check that failed.
  recheck(): void;
}

/// The handle being typed, and what `chain`'s registrar says of it once typing pauses.
export function useHandleEntry(chain: ChainEntry): HandleEntry {
  const parents = chain.nameParents;
  const [text, setText] = useState("");
  const read = readHandle(text, parents);
  const handle = read.ok ? read.value : undefined;
  const asked = useDebouncedValue(handle?.label, CHECK_DEBOUNCE_MS);
  const availability = useNameAvailable(chain, asked);
  const status = handleStatus(read, parents, {
    label: asked,
    available: availability.data,
    failed: availability.isError,
  });
  return { text, setText, handle, status, recheck: () => void availability.refetch() };
}
