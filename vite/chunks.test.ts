import { describe, expect, it } from "vitest";
import { chunkFileNames } from "./chunks";

describe("chunkFileNames", () => {
  it("names a flow's route chunk after its folder", () => {
    expect(
      chunkFileNames({
        name: "DepositForm",
        facadeModuleId: "/repo/src/flows/shield/DepositForm.tsx",
      }),
    ).toBe("assets/shield-[hash].js");
    expect(
      chunkFileNames({
        name: "GenerateLinkForm",
        facadeModuleId: "C:\\repo\\src\\flows\\send-link\\GenerateLinkForm.tsx",
      }),
    ).toBe("assets/send-link-[hash].js");
  });

  it("keeps Rollup's name for anything else", () => {
    expect(
      chunkFileNames({
        name: "build-wallet",
        facadeModuleId: "/repo/src/features/wallet/build/build-wallet.ts",
      }),
    ).toBe("assets/[name]-[hash].js");
    expect(
      chunkFileNames({
        name: "SetupFlow",
        facadeModuleId: "/repo/src/flows/shield/setup/components/SetupFlow.tsx",
      }),
    ).toBe("assets/[name]-[hash].js");
    expect(chunkFileNames({ name: "vendor-react", facadeModuleId: null })).toBe(
      "assets/[name]-[hash].js",
    );
  });
});
