import { ADDRESS_HRP } from "@lelantos-org/sdk";
import { describe, expect, it } from "vitest";
import { depositSchema, transferSchema } from "./schemas";

/// Produced by `deriveKeysFromNsk(123456789n)` against the installed SDK.
const ADDRESS =
  "lelantos1mzzmpusj5uw9jktrllg86psuvjsght583tvlaj0gt5pywqwx3krgyp5h37paffcqkjnrx8zegjcldfgpchw0p6d773g657e5jvfluydsr5za9sgdvm8pdauhzkrzng5tzwpgg2qyhaykrv887pgvsz599ua4r0dl";

function parseTo(to: string) {
  return transferSchema.safeParse({ to, amount: "1.0", asset: "1" });
}

describe("transferSchema.to", () => {
  it("accepts a real derived address", () => {
    expect(parseTo(ADDRESS).success).toBe(true);
  });

  it("is pinned to the SDK's HRP", () => {
    expect(ADDRESS.startsWith(`${ADDRESS_HRP}1`)).toBe(true);
  });

  it("rejects characters outside the bech32 charset", () => {
    // `b`, `i`, `o` and `1` are excluded; a plain [0-9a-z] regex lets them by.
    for (const c of ["b", "i", "o", "1"]) {
      const swapped = `${ADDRESS.slice(0, -1)}${c}`;
      expect(parseTo(swapped).success, `char ${c}`).toBe(false);
    }
  });

  it("rejects a truncated or padded address", () => {
    expect(parseTo(ADDRESS.slice(0, -1)).success).toBe(false);
    expect(parseTo(`${ADDRESS}q`).success).toBe(false);
  });

  it("rejects an EVM address and empty input", () => {
    expect(parseTo("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266").success).toBe(false);
    expect(parseTo("").success).toBe(false);
  });
});

describe("asEth", () => {
  it('does not treat the string "false" as true', () => {
    // `z.coerce.boolean()` is `Boolean(x)`, so every non-empty string — "false"
    // included — coerced to `true`. The field is bound to a hidden input, and
    // the failure mode is a native-ETH deposit for an ERC-20 selection: the
    // user sends real ETH.
    expect(depositSchema.safeParse({ amount: "1", asset: "1", asEth: "false" }).success).toBe(
      false,
    );
  });

  it("accepts real booleans and defaults to false", () => {
    expect(depositSchema.parse({ amount: "1", asset: "1", asEth: true }).asEth).toBe(true);
    expect(depositSchema.parse({ amount: "1", asset: "1" }).asEth).toBe(false);
  });
});
