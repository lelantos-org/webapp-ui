import { isWalletError } from "@lelantos-org/sdk";
import {
  formatHandle,
  NAME_LABEL_MAX_LENGTH,
  NAME_LABEL_MIN_LENGTH,
  parseHandle,
} from "@lelantos-org/sdk/protocol";
import type { ChainEntry } from "@/config/chains";
import { err, ok, type Result } from "@/shared/lib/result";

/// A handle this deployment serves.
export interface Handle {
  /// The bare label the registrar keys it by, lowercase.
  label: string;
  /// The name it is shown under.
  name: string;
}

/// The name a handle is shown under: `label.<first parent>`, or `@label` where the chain lists none.
export function handleName(label: string, parents: readonly string[]): string {
  const [parent] = parents;
  return parent === undefined ? `@${label}` : formatHandle(label, parent);
}

/// Why text that names something is not a handle this deployment serves.
export type HandleRefusal =
  /// Not a label the registrar accepts.
  | "label"
  /// Written under a parent the chain does not list, however similar to one it does.
  | "parent";

/// Why typed text is not a handle: nothing was typed, or what was typed is refused.
export type HandleProblem = "empty" | HandleRefusal;

/// The handle typed text names: bare (`mehow`, `@mehow`) or under one of `parents`.
export function readHandle(
  input: string,
  parents: readonly string[],
): Result<Handle, HandleProblem> {
  if (input.trim().replace(/^@/, "") === "") return err("empty");
  try {
    const { label } = parseHandle(input, parents);
    return ok({ label, name: handleName(label, parents) });
  } catch (e) {
    const parent = isWalletError(e, "INVALID_ARGUMENT") && e.details?.reason === "parent";
    return err(parent ? "parent" : "label");
  }
}

function servedSuffixes(parents: readonly string[]): string {
  return parents.map((p) => `.${p}`).join(" or ");
}

export const LABEL_RULE = `A handle is ${NAME_LABEL_MIN_LENGTH} to ${NAME_LABEL_MAX_LENGTH} characters: a–z, 0–9 and single hyphens, not at the start or the end.`;

/// What to say about text `readHandle` refused.
export function handleRefusalText(refusal: HandleRefusal, parents: readonly string[]): string {
  if (refusal === "label") return LABEL_RULE;
  return parents.length === 0
    ? "Handles here are not served under any name. Enter the handle on its own."
    : `Only names ending in ${servedSuffixes(parents)} are served here. A similar-looking name under anything else belongs to someone else.`;
}

/// The first chain of the registry that runs a handle registrar.
export function registrarChain(registry: readonly ChainEntry[]): ChainEntry | undefined {
  return registry.find((c) => c.nameRegistrarAddress !== undefined);
}

/// The path a handle's public profile opens at.
const PROFILE_PATH = "/profile";

/// The in-app link to a handle's profile. The label rides in the fragment, which is never sent to
/// a server.
export function profilePath(label: string): string {
  return `${PROFILE_PATH}#${label}`;
}
