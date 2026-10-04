// Ops cut short by a page reload. The op store lives in memory, so a reload forgets an op the
// relayer or the user's wallet may already hold; what was running is kept in session storage and
// reported once the page is back.

import { useMemo } from "react";
import { createStore, useStore } from "@/shared/lib/external-store";
import { SESSION_KEYS } from "@/shared/lib/storage/keys";
import { readJson, sessionStore, writeJson } from "@/shared/lib/storage/safe";

export interface InterruptedOp {
  /// Names the op in copy: "transfer", "deposit".
  label: string;
  /// The screen it was started on.
  path: string;
  /// The account it belongs to, from `opScope`.
  scope: string;
  /// It had reached the step that hands it over, so it may have gone through.
  maybeSent: boolean;
  /// When it last changed step (`Date.now()`).
  at: number;
}

/// Past this, the balance has long since settled either way.
const KEEP_MS = 60 * 60 * 1000;

function isOps(value: unknown): value is InterruptedOp[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        typeof v === "object" &&
        v !== null &&
        typeof v.label === "string" &&
        typeof v.path === "string" &&
        typeof v.scope === "string" &&
        typeof v.maybeSent === "boolean" &&
        typeof v.at === "number",
    )
  );
}

const read = (key: string): InterruptedOp[] => readJson(sessionStore, key, isOps) ?? [];

/// What the last page left running joins what it had not yet dismissed.
function carryOver(now = Date.now()): InterruptedOp[] {
  const all = [...read(SESSION_KEYS.opsInterrupted), ...read(SESSION_KEYS.opsRunning)].filter(
    (op) => now - op.at < KEEP_MS,
  );
  sessionStore.remove(SESSION_KEYS.opsRunning);
  writeJson(sessionStore, SESSION_KEYS.opsInterrupted, all);
  return all;
}

const store = createStore<InterruptedOp[]>(carryOver());

/// What `rememberRunning` last recorded, serialised: most op-store writes change none of it.
let remembered = "[]";

/// Record what is running now, so the next page load can tell what a reload cut short.
export function rememberRunning(ops: Omit<InterruptedOp, "at">[]): void {
  const next = JSON.stringify(ops);
  if (next === remembered) return;
  remembered = next;
  if (ops.length === 0) {
    sessionStore.remove(SESSION_KEYS.opsRunning);
    return;
  }
  const at = Date.now();
  writeJson(
    sessionStore,
    SESSION_KEYS.opsRunning,
    ops.map((op) => ({ ...op, at })),
  );
}

/// The ops of account `scope` that a reload cut short and the user has not dismissed.
export function useInterruptedOps(scope: string): InterruptedOp[] {
  const all = useStore(store);
  return useMemo(() => all.filter((op) => op.scope === scope), [all, scope]);
}

export function dismissInterrupted(scope: string): void {
  const rest = store.getState().filter((op) => op.scope !== scope);
  writeJson(sessionStore, SESSION_KEYS.opsInterrupted, rest);
  store.setState(rest);
}

/// Read session storage again, as a page load does. Tests only.
export function reloadInterruptedForTest(): void {
  remembered = "[]";
  store.setState(carryOver());
}
