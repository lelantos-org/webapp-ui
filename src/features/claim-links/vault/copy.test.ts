import { describe, expect, it } from "vitest";
import type { RegisteredAsset } from "@/config/chains";
import { DAY_MS } from "@/shared/lib/format/time";
import { USDC_ASSET } from "@/test/fixtures/assets";
import {
  capacityBody,
  capacityHeadline,
  daysLabel,
  describeStoredAmount,
  dropsBadge,
  evictionSentence,
  retentionSentence,
  vaultTone,
} from "./copy";
import type { ClaimLinkPressure } from "./policy";
import type { StoredClaimLink } from "./record";

const USDC = USDC_ASSET;

const link = (over: Partial<StoredClaimLink> = {}): StoredClaimLink => ({
  id: "r1",
  url: "https://app/claim#deadbeef",
  chainId: "31337",
  assetId: "1",
  amount: "2500000",
  createdAt: 1_767_225_600_000,
  ...over,
});

const pressure = (over: Partial<ClaimLinkPressure> = {}): ClaimLinkPressure => ({
  count: 12,
  capacity: 50,
  ttlMs: 7 * DAY_MS,
  expiringSoon: 0,
  oldestExpiresIn: undefined,
  roomLeft: 38,
  nextEvicted: undefined,
  ...over,
});

describe("describeStoredAmount", () => {
  it("denominates a registered asset", () => {
    expect(describeStoredAmount(link(), [USDC])).toBe("2.5 USDC");
  });

  it("scales circuit units by the asset's scale", () => {
    const scaled: RegisteredAsset = { ...USDC, id: 2n, symbol: "WBTC", decimals: 8, scale: 100n };

    expect(describeStoredAmount(link({ assetId: "2", amount: "1000000" }), [scaled])).toBe(
      "1 WBTC",
    );
  });

  it("labels the raw figure when the asset is not registered on this chain", () => {
    expect(describeStoredAmount(link({ assetId: "9" }), [USDC])).toBe("2500000 (asset #9)");
  });

  it("does not throw on an empty registry", () => {
    expect(describeStoredAmount(link(), [])).toBe("2500000 (asset #1)");
  });
});

describe("capacity copy", () => {
  it("says the count is browser-wide", () => {
    expect(capacityHeadline(pressure({ count: 47 }))).toBe(
      "This browser keeps 50 links across every network. You have 47.",
    );
  });

  it("stays a meter while there is room", () => {
    const p = pressure();
    expect(vaultTone(p)).toBe("neutral");
    expect(capacityBody(p)).toContain("after 7 days");
  });

  it("warns at the threshold, counting the link that would evict", () => {
    const p = pressure({ count: 47, roomLeft: 3 });
    expect(vaultTone(p)).toBe("err");
    expect(capacityBody(p)).toMatch(/^Creating four more links will drop the oldest records/);
  });

  it("describes the next link as the one that drops a record when full", () => {
    expect(capacityBody(pressure({ count: 50, roomLeft: 0 }))).toMatch(
      /^The next link you create drops the oldest record/,
    );
  });

  it("derives the window from ttlMs, not a literal", () => {
    expect(capacityBody(pressure({ ttlMs: 30 * DAY_MS }))).toContain("after 30 days");
    expect(retentionSentence(30 * DAY_MS)).toBe(
      "Works once. We keep a copy in this browser for 30 days or until you delete it.",
    );
  });
});

describe("dropsBadge", () => {
  it("stays quiet until two days out", () => {
    expect(dropsBadge(3 * DAY_MS)).toBeUndefined();
    expect(dropsBadge(2 * DAY_MS)).toBe("drops in 2 days");
    expect(dropsBadge(DAY_MS + 1)).toBe("drops in 2 days");
    expect(dropsBadge(DAY_MS)).toBe("drops within a day");
    expect(dropsBadge(0)).toBe("drops within a day");
  });
});

describe("small helpers", () => {
  it("pluralises days", () => {
    expect(daysLabel(DAY_MS)).toBe("1 day");
    expect(daysLabel(7 * DAY_MS)).toBe("7 days");
  });

  it("names the evicted record", () => {
    const now = link().createdAt + 6 * DAY_MS;
    expect(evictionSentence(link(), [USDC], now)).toBe(
      "This browser is full. Creating this link drops your oldest record — 2.5 USDC, made 6 days ago — and its key cannot be recovered.",
    );
  });
});
