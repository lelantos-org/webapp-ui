import { describe, expect, it } from "vitest";
import { hashedName, retargetScript } from "./hashed-script";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("hashedName", () => {
  it("puts the file under assets/, with its content's hash before the extension", () => {
    expect(hashedName("theme-init.js", bytes("a"))).toMatch(/^assets\/theme-init-[0-9a-f]{8}\.js$/);
  });

  it("changes with the content and with nothing else", () => {
    expect(hashedName("theme-init.js", bytes("a"))).toBe(hashedName("theme-init.js", bytes("a")));
    expect(hashedName("theme-init.js", bytes("a"))).not.toBe(
      hashedName("theme-init.js", bytes("b")),
    );
  });
});

describe("retargetScript", () => {
  it("points the tag at the hashed file", () => {
    expect(
      retargetScript('<script src="/theme-init.js"></script>', "/theme-init.js", "/assets/t-1.js"),
    ).toBe('<script src="/assets/t-1.js"></script>');
  });

  it("fails the build when the tag is gone", () => {
    expect(() => retargetScript("<head></head>", "/theme-init.js", "/assets/t-1.js")).toThrow(
      /theme-init\.js/,
    );
  });
});
