import { type Handle, type HandleProblem, handleRefusalText } from "@/features/names";
import type { Result } from "@/shared/lib/result";

/// Where the typed handle stands.
export type HandleStatus =
  | { kind: "empty" }
  /// `problem` says why the text is not a handle.
  | { kind: "invalid"; problem: string }
  /// A handle whose availability is not known yet.
  | { kind: "checking"; handle: Handle }
  | { kind: "check-failed"; handle: Handle }
  | { kind: "taken"; handle: Handle }
  | { kind: "available"; handle: Handle };

/// The availability answer in hand, and the label it is for.
export interface AvailabilityCheck {
  /// The label the registrar was asked about: the typed one, once typing pauses.
  label: string | undefined;
  available: boolean | undefined;
  failed: boolean;
}

/// Reads the field: what was typed, and what the registrar says of it once it has been asked.
export function handleStatus(
  read: Result<Handle, HandleProblem>,
  parents: readonly string[],
  check: AvailabilityCheck,
): HandleStatus {
  if (!read.ok) {
    return read.error === "empty"
      ? { kind: "empty" }
      : { kind: "invalid", problem: handleRefusalText(read.error, parents) };
  }
  const handle = read.value;
  // An answer for an earlier label says nothing about this one.
  if (check.label !== handle.label) return { kind: "checking", handle };
  if (check.available !== undefined) {
    return { kind: check.available ? "available" : "taken", handle };
  }
  return { kind: check.failed ? "check-failed" : "checking", handle };
}
