import { describe, expect, it } from "vitest";
import { screenTitle } from "./titles";

describe("screenTitle", () => {
  it("names the screen ahead of the app", () => {
    expect(screenTitle("/shield")).toBe("Shield · Lelantos Wallet");
    expect(screenTitle("/send")).toBe("Send · Lelantos Wallet");
  });

  it("tells a nested screen from the one its path starts with", () => {
    expect(screenTitle("/send/link")).toBe("Send by link · Lelantos Wallet");
    expect(screenTitle("/sender")).toBe("Lelantos Wallet");
  });

  it("matches route patterns in the order the router does", () => {
    expect(screenTitle("/governance/new")).toBe("New proposal · Lelantos Wallet");
    expect(screenTitle("/governance/42")).toBe("Proposal · Lelantos Wallet");
    expect(screenTitle("/claim")).toBe("Claim · Lelantos Wallet");
  });

  it("names the handle screens, and never the handle a profile is for", () => {
    expect(screenTitle("/name")).toBe("Claim a handle · Lelantos Wallet");
    expect(screenTitle("/profile")).toBe("Profile · Lelantos Wallet");
  });

  it("falls back to the app's name on home and unknown paths", () => {
    expect(screenTitle("/")).toBe("Lelantos Wallet");
    expect(screenTitle("/nope")).toBe("Lelantos Wallet");
  });
});
