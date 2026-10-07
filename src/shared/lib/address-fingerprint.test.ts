import { describe, expect, it } from "vitest";
import { SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import { addressFingerprint } from "./address-fingerprint";

describe("addressFingerprint", () => {
  it("is sixteen named pictures, fixed for an address", () => {
    const marks = addressFingerprint(SHIELDED_ADDRESS);
    expect(marks.map((mark) => mark.emoji).join(" ")).toBe(
      "🐧 📁 🔥 🔥 🐘 🌏 👓 🎸 🍕 ❤️ ☂️ 🎺 🚂 🔨 📎 🦋",
    );
    expect(marks.map((mark) => mark.name).join(" ")).toBe(
      "Penguin Folder Fire Fire Elephant Globe Glasses Guitar Pizza Heart Umbrella Trumpet Train Hammer Paperclip Butterfly",
    );
  });

  it("does not depend on the address's casing", () => {
    expect(addressFingerprint(SHIELDED_ADDRESS.toUpperCase())).toEqual(
      addressFingerprint(SHIELDED_ADDRESS),
    );
  });

  it("changes nearly every picture when one character of the address does", () => {
    const other = `${SHIELDED_ADDRESS.slice(0, -1)}w`;
    const [a, b] = [addressFingerprint(SHIELDED_ADDRESS), addressFingerprint(other)];
    expect(a.filter((mark, i) => mark.emoji === b[i]?.emoji).length).toBeLessThan(4);
  });

  it("draws on all 64 pictures, each with a name of its own", () => {
    const names = new Map<string, string>();
    for (let i = 0; i < 400; i++) {
      for (const { emoji, name } of addressFingerprint(`lelantos1${i}`)) names.set(emoji, name);
    }
    expect(names.size).toBe(64);
    expect(new Set(names.values()).size).toBe(64);
  });
});
