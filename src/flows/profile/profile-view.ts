import type { NameRecord } from "@lelantos-org/sdk/advanced";
import type { Handle, HandleProblem, HandleRefusal } from "@/features/names";
import { isShieldedAddress } from "@/features/op-form";
import type { Result } from "@/shared/lib/result";

/// What the profile page shows. `name` is the handle as displayed.
export type ProfileView =
  /// The served networks are not known yet.
  | { kind: "loading-networks" }
  /// The served networks could not be loaded, so it is not known where handles live.
  | { kind: "networks-failed" }
  /// No network this app serves runs a registrar.
  | { kind: "no-registrar" }
  /// The link carries no handle.
  | { kind: "no-handle" }
  /// The name is malformed, or under a parent this deployment does not serve. Nothing is looked up.
  | { kind: "refused"; problem: HandleRefusal }
  /// The record is being read, or the address it publishes decoded.
  | { kind: "looking-up"; name: string }
  | { kind: "read-failed"; name: string }
  /// Nobody has claimed the handle.
  | { kind: "not-found"; name: string }
  /// Claimed, with its published value cleared.
  | { kind: "unpublished"; name: string }
  /// Claimed, publishing something that is not a shielded address.
  | { kind: "invalid"; name: string }
  | { kind: "ready"; name: string; address: string };

type PublishedRecord = Pick<NameRecord, "registered" | "value">;

/// Reads a registrar record. The registrar stores the value unchecked, so it is checked here.
function recordView(name: string, { registered, value }: PublishedRecord): ProfileView {
  if (!registered) return { kind: "not-found", name };
  if (value === "") return { kind: "unpublished", name };
  return isShieldedAddress(value)
    ? { kind: "ready", name, address: value }
    : { kind: "invalid", name };
}

export interface ProfileInputs {
  /// The fragment read against the registrar chain's parents; `undefined` while no chain with a
  /// registrar is known.
  read: Result<Handle, HandleProblem> | undefined;
  /// The registry fetch, for telling "none yet" from "none at all".
  networks: { loaded: boolean; failed: boolean };
  record: { data: PublishedRecord | undefined; failed: boolean };
}

/// Decides the page's state from the handle in the link and what has been read so far.
export function profileView({ read, networks, record }: ProfileInputs): ProfileView {
  if (!read) {
    if (networks.failed) return { kind: "networks-failed" };
    return { kind: networks.loaded ? "no-registrar" : "loading-networks" };
  }
  if (!read.ok) {
    return read.error === "empty"
      ? { kind: "no-handle" }
      : { kind: "refused", problem: read.error };
  }
  const { name } = read.value;
  if (record.data) return recordView(name, record.data);
  return { kind: record.failed ? "read-failed" : "looking-up", name };
}

/// Holds a `ready` view until its address has decoded in full. `payable` is `undefined` while
/// that is checked, and `false` for an address that does not decode.
export function payableView(view: ProfileView, payable: boolean | undefined): ProfileView {
  if (view.kind !== "ready" || payable === true) return view;
  return { kind: payable === false ? "invalid" : "looking-up", name: view.name };
}

/// Longest stretch of a refused name echoed back: it comes from the link, not from the registrar.
const ECHO_MAX = 64;

/// A refused name as the page quotes it.
export function echoed(typed: string): string {
  return typed.length > ECHO_MAX ? `${typed.slice(0, ECHO_MAX)}…` : typed;
}
