import { describe, expect, it, vi } from "vitest";
import { metamaskDappLink } from "./mobile-wallet-link";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15";

function browser(userAgent: string, href: string, maxTouchPoints = 0): void {
  vi.stubGlobal("navigator", { userAgent, maxTouchPoints });
  vi.stubGlobal("location", new URL(href));
}

describe("metamaskDappLink", () => {
  it("reopens the current page in MetaMask on a phone", () => {
    browser(IPHONE, "https://app.example.org/send?to=secret#frag");
    expect(metamaskDappLink()).toBe("https://metamask.app.link/dapp/app.example.org/send");
  });

  it("counts an iPad, which reports a desktop Mac", () => {
    browser(MAC, "https://app.example.org/", 5);
    expect(metamaskDappLink()).toBe("https://metamask.app.link/dapp/app.example.org/");
  });

  it("offers nothing on a desktop, where the extension is the wallet", () => {
    browser(MAC, "https://app.example.org/");
    expect(metamaskDappLink()).toBeUndefined();
  });

  it("offers nothing off https, which the link cannot open", () => {
    browser(IPHONE, "http://192.168.1.20:5174/");
    expect(metamaskDappLink()).toBeUndefined();
  });
});
