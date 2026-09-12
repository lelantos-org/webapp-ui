// @vitest-environment jsdom
import { RAY } from "@lelantos-org/sdk/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ActionMutation } from "@/features/ops";
import { deferred } from "@/test/harness";
import {
  type ActionSubmitOptions,
  useActionForm,
  useActionSubmit,
  useClearFinishedOp,
} from "./use-action-form";

const ASSET = {
  id: 5n,
  token: "0x0000000000000000000000000000000000000005",
  isWeth: false,
  symbol: "TST",
  decimals: 18,
  // Circuit units are 1e10 base units, so "1.5" parses to 150_000_000.
  scale: 10_000_000_000n,
  // Plain custody: RAY is the identity for every conversion.
  index: RAY,
};

const assets = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  useRegisteredAssets: () => assets.value,
}));

const schema = z.object({ amount: z.string(), asset: z.string() });
type Values = z.infer<typeof schema>;

function setup(
  send: (v: Values, ctx: { asset: unknown; amount: bigint }) => Promise<unknown>,
  opts?: ActionSubmitOptions,
  defaults: Values = { amount: "1.5", asset: "5" },
) {
  const mutation = { reset: vi.fn() } as never;
  const progress = { done: false, reset: vi.fn() } as never;
  return renderHook(() => {
    const api = useActionForm<Values, unknown, unknown>({
      schema,
      defaultValues: defaults,
      action: { mutation, progress },
    });
    const onSubmit = useActionSubmit(api, send, opts);
    return { ...api, onSubmit };
  });
}

describe("useActionForm", () => {
  /// The asset is resolved from a registry that is empty on first paint. A
  /// submit in that window must not reach the mutation: there is no asset to
  /// scale the amount by, so anything sent would be denominated in nothing.
  it("does not send while the asset registry is empty", async () => {
    assets.value = [];
    const send = vi.fn(async () => {});
    const { result } = setup(send);
    await act(() => result.current.onSubmit());
    expect(send).not.toHaveBeenCalled();
  });

  /// The form field is a decimal string; the mutation takes circuit units.
  /// Converting in one place is the reason this hook exists.
  it("hands `send` the amount already in circuit units", async () => {
    assets.value = [ASSET];
    const send = vi.fn(async (_v: Values, _ctx: { asset: unknown; amount: bigint }) => {});
    const { result } = setup(send);
    await act(() => result.current.onSubmit());
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]?.[1]).toMatchObject({ amount: 150_000_000n, asset: ASSET });
  });

  it("clears the amount once the send resolves", async () => {
    assets.value = [ASSET];
    const { result } = setup(async () => ({ txHash: "0x1" }));
    await act(() => result.current.onSubmit());
    await waitFor(() => expect(result.current.form.getValues("amount")).toBe(""));
    expect(result.current.form.getValues("asset")).toBe("5");
  });

  /// Clearing is the success path only. A rejected submit — a declined wallet
  /// prompt, a relayer refusal — must leave the entry the user typed, or they
  /// retype it every time something fails.
  it("keeps the amount when `send` rejects", async () => {
    assets.value = [ASSET];
    const { result } = setup(async () => {
      throw new Error("declined");
    });
    await act(() => result.current.onSubmit());
    await waitFor(() => expect(result.current.form.getValues("amount")).toBe("1.5"));
  });

  it("keeps the amount when `send` says nothing was sent", async () => {
    assets.value = [ASSET];
    const send = vi.fn(async () => false);
    const { result } = setup(send);
    await act(() => result.current.onSubmit());
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.form.getValues("amount")).toBe("1.5");
  });

  it("does not send a form that is not ready", async () => {
    assets.value = [ASSET];
    const send = vi.fn(async () => {});
    const { result } = setup(send, { ready: false });
    await act(() => result.current.onSubmit());
    expect(send).not.toHaveBeenCalled();
  });

  it("reports an amount too fine for the asset where asked, without sending", async () => {
    assets.value = [ASSET];
    const send = vi.fn(async () => {});
    const onParseError = vi.fn();
    const { result } = setup(send, { onParseError }, { amount: "0.00000000001", asset: "5" });
    await act(() => result.current.onSubmit());
    expect(onParseError).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  /// `handleSubmit` awaits the zod resolver, so several microtasks pass before
  /// `isPending` disables the button. Holding Enter lands more than one submit;
  /// for a spend that is two proofs racing the same notes.
  it("ignores a second submit while the first is in flight", async () => {
    assets.value = [ASSET];
    const gate = deferred<void>();
    const send = vi.fn(() => gate.promise);
    const { result } = setup(send);

    act(() => {
      void result.current.onSubmit();
    });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await act(() => result.current.onSubmit());
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => gate.resolve());
  });
});

type Mutation = ActionMutation<unknown, unknown>["mutation"];

/// The hook reads four values off its arguments. A real `useMutation` would
/// require a QueryClient and a wallet without exercising the gate any further
/// than these stubs do.
function harness(done: boolean) {
  const resetMutation = vi.fn();
  const resetProgress = vi.fn();
  const progress = (d: boolean) => ({ done: d, reset: resetProgress });
  const { result, rerender } = renderHook(
    ({ d }) => useClearFinishedOp({ reset: resetMutation } as unknown as Mutation, progress(d)),
    { initialProps: { d: done } },
  );
  return { result, rerender, resetMutation, resetProgress };
}

describe("useClearFinishedOp", () => {
  it("clears the stepper and the mutation once the op is done", () => {
    const h = harness(true);
    h.result.current();
    expect(h.resetProgress).toHaveBeenCalledOnce();
    expect(h.resetMutation).toHaveBeenCalledOnce();
  });

  // The mutation resolves at broadcast while `useTxTracker` keeps advancing
  // the stepper toward block inclusion. Clearing there would blank a stepper
  // that is still moving, which is why the gate is `done` and not `isPending`.
  it("leaves a still-advancing stepper alone", () => {
    const h = harness(false);
    h.result.current();
    expect(h.resetProgress).not.toHaveBeenCalled();
    expect(h.resetMutation).not.toHaveBeenCalled();
  });

  it("starts clearing once the op reaches its terminal phase", () => {
    const h = harness(false);
    h.result.current();
    expect(h.resetProgress).not.toHaveBeenCalled();

    h.rerender({ d: true });
    h.result.current();
    expect(h.resetProgress).toHaveBeenCalledOnce();
    expect(h.resetMutation).toHaveBeenCalledOnce();
  });
});
