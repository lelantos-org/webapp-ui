import { beforeEach, describe, expect, it } from "vitest";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { localStore } from "@/shared/lib/storage/safe";
import { detail } from "@/test/fakes/eip6963";
import { offerings } from "./wallet-offerings";

const METAMASK = detail("uuid-mm", "io.metamask", "MetaMask");
const PHANTOM = detail("uuid-ph", "app.phantom", "Phantom");

const ids = () => offerings([METAMASK, PHANTOM]).map((c) => c.id);

describe("offerings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("offers Phantom as a browser wallet row", () => {
    expect(offerings([PHANTOM])).toContainEqual({
      kind: "eip1193",
      id: "app.phantom",
      name: "Phantom",
      icon: "",
    });
  });

  it("keeps announce order with no remembered wallet", () => {
    expect(ids().filter((id) => id !== "passkey")).toEqual(["io.metamask", "app.phantom"]);
  });

  it("puts a remembered Phantom first, ahead of the passkey", () => {
    localStore.set(LOCAL_KEYS.preferredRdns, "app.phantom");

    expect(ids().slice(0, 2)).toEqual(["app.phantom", "io.metamask"]);
  });
});
