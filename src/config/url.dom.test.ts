import { describe, expect, it } from "vitest";
import { httpUrl, isHttpUrl, stripTrailingSlash } from "./url";

describe("isHttpUrl", () => {
  it("accepts http and https", () => {
    expect(isHttpUrl("https://rpc.example")).toBe(true);
    expect(isHttpUrl("http://localhost:8545")).toBe(true);
  });

  it("rejects the schemes that execute", () => {
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isHttpUrl("vbscript:msgbox(1)")).toBe(false);
  });

  it("rejects other non-fetchable schemes", () => {
    expect(isHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isHttpUrl("ws://rpc.example")).toBe(false);
  });

  it("rejects a value that is not a URL at all", () => {
    expect(isHttpUrl("")).toBe(false);
    expect(isHttpUrl("rpc.example")).toBe(false);
  });
});

describe("stripTrailingSlash", () => {
  it("drops one trailing slash", () => {
    expect(stripTrailingSlash("https://a.example/")).toBe("https://a.example");
  });

  it("leaves a bare value alone", () => {
    expect(stripTrailingSlash("https://a.example")).toBe("https://a.example");
  });
});

describe("httpUrl", () => {
  it("passes an absolute https URL through", () => {
    expect(httpUrl.parse("https://rpc.example")).toBe("https://rpc.example");
  });

  it("resolves a page-relative path against the page origin", () => {
    expect(httpUrl.parse("/rpc/v1/31337")).toBe(`${window.location.origin}/rpc/v1/31337`);
  });

  it("normalises a trailing slash", () => {
    expect(httpUrl.parse("https://rpc.example/")).toBe("https://rpc.example");
  });

  it("rejects a scheme that executes", () => {
    expect(httpUrl.safeParse("javascript:alert(1)").success).toBe(false);
    expect(httpUrl.safeParse("data:text/html,x").success).toBe(false);
  });
});
