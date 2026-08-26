import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { deferred } from "@/test/harness";
import { useActionForm } from "./use-action-form";

const ASSET = {
  id: 5n,
  token: "0x0000000000000000000000000000000000000005",
  isWeth: false,
  symbol: "TST",
  decimals: 18,
  // Circuit units are 1e10 base units, so "1.5" parses to 150_000_000.
  scale: 10_000_000_000n,
};

const assets = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock("@/features/assets", () => ({
  useRegisteredAssets: () => assets.value,
  findAsset: (list: { id: bigint }[], id: string) => list.find((a) => a.id === BigInt(id)),
}));

const schema = z.object({ amount: z.string(), asset: z.string() });
type Values = z.infer<typeof schema>;

function setup(send: (v: Values, ctx: { asset: unknown; amount: bigint }) => Promise<unknown>) {
  const mutation = { reset: vi.fn() } as never;
  const progress = { done: false, reset: vi.fn() } as never;
  return renderHook(() =>
    useActionForm<Values, unknown, unknown>({
      schema,
      defaultValues: { amount: "1.5", asset: "5" },
      action: { mutation, progress },
      send,
    }),
  );
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

  /// `handleSubmit` awaits the zod resolver, so several microtasks pass before
  /// `isPending` disables the button. Holding Enter lands more than one submit;
  /// for a spend that is two proofs racing the same notes.
  it("ignores a second submit while the first is in flight", async () => {
    assets.value = [ASSET];
    const gate = deferred<void>();
    const send = vi.fn(() => gate.promise);
    const { result } = setup(send);

    await act(async () => {
      void result.current.onSubmit();
      await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      await result.current.onSubmit();
      expect(send).toHaveBeenCalledTimes(1);
      gate.resolve();
    });
  });
});
