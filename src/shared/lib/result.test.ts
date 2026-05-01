import { describe, expect, it } from "vitest";
import { andThen, err, map, mapErr, ok, tryCatch, unwrap } from "./result";

describe("Result", () => {
  it("ok holds value", () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  it("err holds error", () => {
    const r = err("nope");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("nope");
  });

  it("map transforms ok, passes err", () => {
    expect(map(ok(2), (n) => n * 2)).toEqual(ok(4));
    expect(map(err("e"), (n: number) => n * 2)).toEqual(err("e"));
  });

  it("mapErr transforms err, passes ok", () => {
    expect(mapErr(err("a"), (e) => `${e}!`)).toEqual(err("a!"));
    expect(mapErr(ok(1), (e: string) => e)).toEqual(ok(1));
  });

  it("andThen chains and short-circuits", () => {
    const half = (n: number) => (n % 2 === 0 ? ok(n / 2) : err("odd"));
    expect(andThen(ok(8), half)).toEqual(ok(4));
    expect(andThen(ok(7), half)).toEqual(err("odd"));
    expect(andThen(err<string>("upstream"), half)).toEqual(err("upstream"));
  });

  it("tryCatch wraps thrown errors", () => {
    expect(tryCatch(() => 1)).toEqual(ok(1));
    expect(
      tryCatch(() => {
        throw new Error("boom");
      }),
    ).toEqual(err("boom"));
  });

  it("unwrap returns ok value, throws on err", () => {
    expect(unwrap(ok(5))).toBe(5);
    expect(() => unwrap(err("rip"))).toThrow(/rip/);
  });
});
