import { describe, expect, it } from "vitest";
import { accountDigest } from "@/shared/lib/storage/digest";
import { chooseEndpoints } from "@/test/endpoints";
import { linkNoteStoreKey, linkNoteStoreKeys, walletStoreKey } from "./store-key";

const MASP = "0x0165878A594ca255338adfa4d48449f69242Eb8F";
const ACCOUNT = "0xabcdefabcdefabcdefabcdefabcdefabcdefabc1";
const TAIL = `7a69:${accountDigest(MASP)}:${accountDigest(ACCOUNT)}`;
const SCOPED = /^ep:[0-9a-f]{16}:/;

const keys = () =>
  (["notes", "tree", "nullifiers"] as const).map((kind) =>
    walletStoreKey(kind, 31337n, MASP, ACCOUNT),
  );

describe("walletStoreKey", () => {
  it("keeps the keys existing wallets are stored under on the build's own feed", () => {
    expect(keys()).toEqual([`notes:${TAIL}`, `tree:${TAIL}`, `nullifiers:${TAIL}`]);
  });

  it("gives a chosen feed its own notes and nullifiers, and shares the tree", () => {
    chooseEndpoints({ fmdUrl: "https://fmd.example.com" });
    const [notes = "", tree, nullifiers = ""] = keys();

    expect(notes).toMatch(SCOPED);
    expect(notes.replace(SCOPED, "")).toBe(`notes:${TAIL}`);
    expect(nullifiers.replace(SCOPED, "")).toBe(`nullifiers:${TAIL}`);
    expect(tree).toBe(`tree:${TAIL}`);
  });

  it("keeps two chosen feeds apart", () => {
    chooseEndpoints({ fmdUrl: "https://fmd.example.com" });
    const [first] = keys();
    chooseEndpoints({ fmdUrl: "https://fmd.other.example.com" });
    expect(keys()[0]).not.toBe(first);
  });

  it("is not moved by an endpoint that serves no notes", () => {
    chooseEndpoints({ relayerUrl: "https://relayer.example.com" });
    expect(keys()[0]).toBe(`notes:${TAIL}`);
  });
});

describe("a claim link's note store", () => {
  it("keeps its key on the build's own feed, the only one it can then be under", () => {
    expect(linkNoteStoreKey(31337n, "abc")).toBe("notes:eph:7a69:abc");
    expect(linkNoteStoreKeys(31337n, "abc")).toEqual(["notes:eph:7a69:abc"]);
  });

  it("moves with a chosen feed, and may still be under the build's", () => {
    chooseEndpoints({ fmdUrl: "https://fmd.example.com" });
    const key = linkNoteStoreKey(31337n, "abc");

    expect(key).toMatch(SCOPED);
    expect(linkNoteStoreKeys(31337n, "abc")).toEqual(["notes:eph:7a69:abc", key]);
  });
});
