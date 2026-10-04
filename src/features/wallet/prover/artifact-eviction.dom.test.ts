import { ARTIFACT_CACHE_NAME } from "@lelantos-org/sdk/prover";
import { afterEach, describe, expect, it, vi } from "vitest";
import { evictStaleArtifacts } from "./artifact-eviction";

/// A `CacheStorage` holding one cache, with the requests given.
function stubCaches(urls: string[]) {
  const held = new Set(urls);
  const cache = {
    keys: async () => [...held].map((url) => ({ url })),
    delete: async (request: { url: string }) => held.delete(request.url),
  };
  const open = vi.fn(async () => cache);
  vi.stubGlobal("caches", { open });
  return { held, open };
}

const at = (path: string) => new URL(path, location.href).href;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("evictStaleArtifacts", () => {
  it("drops the artifacts of earlier releases and keeps this one's", async () => {
    const { held, open } = stubCaches([
      at("/assets/4x6_final-OLD.zkey"),
      at("/assets/4x6-OLD.wasm"),
      at("/assets/4x6_final-NEW.zkey"),
      at("/assets/4x6-NEW.wasm"),
    ]);

    const dropped = await evictStaleArtifacts([
      "/assets/4x6_final-NEW.zkey",
      "/assets/4x6-NEW.wasm",
    ]);

    expect(open).toHaveBeenCalledWith(ARTIFACT_CACHE_NAME);
    expect(dropped).toBe(2);
    expect([...held]).toEqual([at("/assets/4x6_final-NEW.zkey"), at("/assets/4x6-NEW.wasm")]);
  });

  it("touches nothing when only this release is cached", async () => {
    const { held } = stubCaches([at("/assets/4x6-NEW.wasm")]);
    expect(await evictStaleArtifacts(["/assets/4x6-NEW.wasm"])).toBe(0);
    expect(held.size).toBe(1);
  });

  it("is a no-op where there is no Cache API, and never throws", async () => {
    vi.stubGlobal("caches", undefined);
    expect(await evictStaleArtifacts(["/a"])).toBe(0);

    vi.stubGlobal("caches", {
      open: async () => {
        throw new Error("blocked");
      },
    });
    expect(await evictStaleArtifacts(["/a"])).toBe(0);
  });
});
