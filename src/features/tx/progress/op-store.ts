// Operations in flight, held outside React: an op started on a form keeps its progress and its
// outcome when the form unmounts, and shows them again when the user comes back.

import { useMemo } from "react";
import { createStore, useStore } from "@/shared/lib/external-store";
import { toastConfirmed } from "../lifecycle/toast-tx";
import { rememberRunning } from "./interrupted-ops";
import { recordProveDuration } from "./prove-eta";
import { handedOff, reached } from "./tx-copy";
import {
  isTerminal,
  opInFlight,
  type Step,
  type TxPhase,
  terminalOf,
  withConsolidation,
} from "./tx-progress";

export interface TxProgress {
  /// Current phase, or `undefined` while idle or before the first call.
  phase: TxPhase | undefined;
  /// Ordered step list for the active op, set when the mutation starts.
  steps: Step[];
  /// A terminal phase has been reached, including ones outside the step list.
  done: boolean;
  /// The last in-list phase before `failed`; it decides whether anything may have been spent.
  failedAt: TxPhase | undefined;
  /// The terminal phase the op ended on, including out-of-list ones such as `unknown`.
  endedAs: TxPhase | undefined;
  /// When the current proof began (`Date.now()`), while `phase` is `proving`.
  provingSince: number | undefined;
  /// What the op moves, as its form worded it ("250 USDC"): the form's fields do not survive it.
  amount: string | undefined;
}

/// What an op is, fixed when it starts.
export interface OpMeta {
  /// Names the op in copy: "transfer", "deposit".
  label: string;
  /// The screen it was started on.
  path: string;
  /// The account it belongs to, from `opScope`.
  scope: string;
}

export interface OpRecord extends TxProgress, OpMeta {
  /// The mutation's state, mirrored so it outlives the hook that ran it.
  status: "idle" | "running" | "done" | "failed";
  result: unknown;
  error: unknown;
}

const IDLE_PROGRESS: TxProgress = {
  phase: undefined,
  steps: [],
  done: false,
  failedAt: undefined,
  endedAs: undefined,
  provingSince: undefined,
  amount: undefined,
};

const IDLE_OP: OpRecord = Object.freeze({
  ...IDLE_PROGRESS,
  label: "",
  path: "",
  scope: "",
  status: "idle",
  result: undefined,
  error: undefined,
});

const records = new Map<string, OpRecord>();
const store = createStore<ReadonlyMap<string, OpRecord>>(new Map());
/// Mounted readers per key. An op that settles with none is announced by toast instead.
const observers = new Map<string, number>();

const read = (key: string): OpRecord => records.get(key) ?? IDLE_OP;

const LOCAL = "local:";

/// The key of an op that belongs to one hook instance and is dropped with it, such as a row's
/// own action: nobody can come back to it, and its siblings must not share it.
export function localOpKey(instance: string): string {
  return `${LOCAL}${instance}`;
}

function write(key: string, next: OpRecord): void {
  // A local op whose hook is gone has nobody to read it.
  if (key.startsWith(LOCAL) && !observers.has(key)) return;
  records.set(key, next);
  store.setState(new Map(records));
  rememberRunning(running());
}

/// The ops a reload would cut short: local ones are a row's own action, with no screen to
/// report on.
function running() {
  return [...records]
    .filter(([key, rec]) => rec.status === "running" && !key.startsWith(LOCAL))
    .map(([, { label, path, scope, steps, phase }]) => ({
      label,
      path,
      scope,
      // From here the relayer, or the user's wallet, may already have it.
      maybeSent: reached({ steps, phase }, "submitting"),
    }));
}

/// The scope an account's ops are filed under.
export function opScope(chainId: bigint, address: string | undefined): string {
  return `${chainId}:${address ?? "none"}`;
}

/// The key of the op `name` (one per form) for the account `scope`.
export function opKey(scope: string, name: string): string {
  return `${scope}:${name}`;
}

/// A new op under `key` is running; whatever the key held before is replaced.
export function beginOp(key: string, meta: OpMeta): void {
  write(key, { ...IDLE_OP, ...meta, status: "running" });
}

export function settleOp(key: string, result: unknown): void {
  write(key, { ...read(key), status: "done", result, error: undefined });
}

export function failOp(key: string, error: unknown): void {
  write(key, { ...read(key), status: "failed", error, result: undefined });
}

/// Forget the op's outcome, keeping its stepper.
export function clearOpOutcome(key: string): void {
  const rec = read(key);
  if (rec.status === "idle") return;
  write(key, { ...rec, status: "idle", result: undefined, error: undefined });
}

/// Begin the op's stepper, or empty it with no steps. Its terminal phase is `terminalOf(steps)`.
export function startOpSteps(key: string, steps: Step[]): void {
  const rec = read(key);
  // The form may have noted the amount before the op got to its steps.
  const amount = steps.length > 0 ? rec.amount : undefined;
  write(key, { ...rec, ...IDLE_PROGRESS, amount, steps });
}

export function noteOpAmount(key: string, amount: string): void {
  const rec = read(key);
  if (rec.amount !== amount) write(key, { ...rec, amount });
}

export function setOpPhase(key: string, phase: TxPhase): void {
  let rec = read(key);
  // A finished op only takes another ending: a step reported late must not reopen it.
  if (rec.done && !isTerminal(phase)) return;
  // The merge is not known in advance: its step joins the list when the spend reports it.
  if (phase === "consolidating") rec = { ...rec, steps: withConsolidation(rec.steps) };
  const patch: Partial<TxProgress> = {};
  if (isTerminal(phase) || phase === terminalOf(rec.steps)) {
    patch.done = true;
    patch.endedAs = phase;
  }

  if (rec.provingSince !== undefined && phase !== "proving") {
    if (phase === "submitting") recordProveDuration(Date.now() - rec.provingSince);
    patch.provingSince = undefined;
  }
  if (phase === "proving" && rec.provingSince === undefined) patch.provingSince = Date.now();

  if (phase === "failed") {
    patch.failedAt = rec.phase === "failed" ? rec.failedAt : rec.phase;
    patch.phase = phase;
  } else if (rec.steps.some((s) => s.id === phase)) {
    // Out-of-list phases are dropped, or a late `settled` would regress the stepper.
    patch.phase = phase;
  }
  if (Object.keys(patch).length === 0) return;

  write(key, { ...rec, ...patch });
  if (patch.done && !rec.done) announceIfUnseen(key, phase, rec.label);
}

/// A failure or an unobserved outcome is toasted by the lifecycle; a success is shown on the
/// form's card, so it is toasted only when no form is there to show it.
function announceIfUnseen(key: string, endedAs: TxPhase, label: string): void {
  if (endedAs === "failed" || endedAs === "unknown") return;
  if (label && !observers.has(key)) toastConfirmed(label);
}

/// Register a mounted reader of `key`; returns the function that removes it. A local op's
/// record goes with its last reader.
export function observeOp(key: string): () => void {
  observers.set(key, (observers.get(key) ?? 0) + 1);
  return () => {
    const left = (observers.get(key) ?? 1) - 1;
    if (left > 0) {
      observers.set(key, left);
      return;
    }
    observers.delete(key);
    if (key.startsWith(LOCAL) && records.delete(key)) store.setState(new Map(records));
  };
}

/// Whether a mounted form is showing the op under `key`.
export function isOpObserved(key: string): boolean {
  return observers.has(key);
}

export function useOp(key: string): OpRecord {
  return useStore(store, (s) => s.get(key) ?? IDLE_OP);
}

const inFlight = (rec: OpRecord): boolean =>
  opInFlight({ ...rec, running: rec.status === "running", sent: rec.status === "done" });

/// The ops of account `scope` that have not finished, oldest first.
export function useOpsInFlight(scope: string): OpRecord[] {
  const all = useStore(store);
  return useMemo(
    () => [...all.values()].filter((rec) => rec.scope === scope && inFlight(rec)),
    [all, scope],
  );
}

const needsTab = (all: ReadonlyMap<string, OpRecord>): boolean =>
  [...all.values()].some(
    (rec) =>
      rec.status === "running" && !handedOff({ steps: rec.steps, phase: rec.phase, hash: false }),
  );

/// Whether an op is running that closing the tab would stop.
export function useOpNeedsTab(): boolean {
  return useStore(store, needsTab);
}

/// Empty the store. Tests only.
export function resetOpsForTest(): void {
  records.clear();
  observers.clear();
  store.setState(new Map());
  rememberRunning([]);
}
