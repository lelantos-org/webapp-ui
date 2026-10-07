import type { Money, RegisterNameResult } from "@lelantos-org/sdk";
import { describe, expect, it } from "vitest";
import { hexAddress } from "@/test/fixtures/addresses";
import { makeAsset, USDC_ASSET } from "@/test/fixtures/assets";
import {
  feesPaidLine,
  outcomeCopy,
  type RegistrationOutcome,
  registrationCard,
  registrationOutcome,
} from "./outcome";

const NAME = "mehow.lelantos.xyz";
const DAI = makeAsset(3n, "DAI");
const money = (baseUnits: bigint, asset = 1n) => ({ asset, amount: baseUnits, baseUnits }) as Money;
type Fees = Pick<RegisterNameResult, "registrationFee" | "fees">;
/// A registration that paid the registrar, the relayer and the pool, all in USDC.
const PAID: Fees = {
  registrationFee: money(5_000_000n),
  fees: { relayer: money(20_000n), protocol: money(15_000n) },
};
const FREE: Fees = { registrationFee: null, fees: { relayer: null, protocol: null } };

describe("registrationOutcome", () => {
  const MINE = hexAddress("c0");
  const result = (registered: boolean | undefined) =>
    ({ registered, controller: MINE }) as Pick<RegisterNameResult, "registered" | "controller">;
  const record = (controller: string, registered = true) => ({ registered, controller }) as never;

  it("takes the receipt's word when it was read", () => {
    expect(registrationOutcome(result(true), undefined)).toBe("registered");
    expect(registrationOutcome(result(false), undefined)).toBe("refunded");
    // The record of a refunded label belongs to whoever claimed it first.
    expect(registrationOutcome(result(false), record(MINE))).toBe("refunded");
  });

  it("is unknown without a receipt, until the registrar settles it", () => {
    expect(registrationOutcome(result(undefined), undefined)).toBe("unknown");
    expect(registrationOutcome(result(undefined), record(hexAddress("00"), false))).toBe("unknown");
  });

  it("settles an unread receipt from the record's controller", () => {
    expect(registrationOutcome(result(undefined), record(MINE.toUpperCase()))).toBe("registered");
    expect(registrationOutcome(result(undefined), record(hexAddress("ee")))).toBe("refunded");
  });
});

describe("feesPaidLine", () => {
  it("lists what a registration paid, to whom", () => {
    expect(feesPaidLine(PAID, "registered", [USDC_ASSET])).toBe(
      "Fees paid: 5.00 USDC to the registrar, 0.02 USDC to the relayer, 0.015 USDC to the pool.",
    );
  });

  it("leaves the registrar out of a refunded one", () => {
    expect(feesPaidLine(PAID, "refunded", [USDC_ASSET])).toBe(
      "Fees paid: 0.02 USDC to the relayer, 0.015 USDC to the pool.",
    );
  });

  it("does not say the registrar was paid while that is unknown", () => {
    expect(feesPaidLine(PAID, "unknown", [USDC_ASSET])).toMatch(
      /^Fees: 5\.00 USDC to the registrar/,
    );
  });

  it("skips a fee that was not charged, or whose asset is not listed", () => {
    expect(feesPaidLine(FREE, "registered", [USDC_ASSET])).toBeUndefined();
    expect(feesPaidLine(PAID, "registered", [DAI])).toBeUndefined();
  });
});

describe("outcomeCopy", () => {
  it("says the handle is the user's, and that it is public for good", () => {
    const copy = outcomeCopy("registered", NAME);
    expect(copy).toMatchObject({
      title: "Handle claimed",
      unconfirmed: false,
      link: `View ${NAME}`,
    });
    expect(copy.note).toContain(`${NAME} is yours.`);
    expect(copy.note).toContain("public and stay in the chain's history");
  });

  it("says a refunded handle was not claimed, the funds came back, and only fees were spent", () => {
    const copy = outcomeCopy("refunded", NAME);
    expect(copy).toMatchObject({ title: "Handle not claimed", unconfirmed: true, link: undefined });
    expect(copy.note).toContain(`${NAME} was not registered`);
    expect(copy.note).toContain("coming back to your shielded balance as a new note");
    expect(copy.note).toContain("Only the relayer's and the pool's fees were spent");
  });

  it("claims neither outcome when the receipt could not be read, and offers to check", () => {
    const copy = outcomeCopy("unknown", NAME);
    expect(copy).toMatchObject({
      title: "Sent, outcome not known yet",
      unconfirmed: true,
      link: `Check ${NAME}`,
    });
    expect(copy.note).toContain("it is not known whether");
    expect(copy.note).toContain("Check the handle before trying again");
  });

  it("words every outcome differently", () => {
    const notes = (["registered", "refunded", "unknown"] as const).map(
      (o) => outcomeCopy(o, NAME).note,
    );
    expect(new Set(notes).size).toBe(3);
  });
});

describe("registrationCard", () => {
  const CHAIN = { nameParents: ["lelantos.xyz"], tokens: [USDC_ASSET] };
  const card = (outcome: RegistrationOutcome, result = PAID) =>
    registrationCard({ label: "mehow", ...result }, outcome, CHAIN);

  it("words the outcome under the handle's shown name, with the fees it spent", () => {
    const { note, ...copy } = outcomeCopy("registered", NAME);
    expect(card("registered")).toMatchObject({ title: copy.title, unconfirmed: copy.unconfirmed });
    expect(card("registered").note).toBe(
      `${note} Fees paid: 5.00 USDC to the registrar, 0.02 USDC to the relayer, 0.015 USDC to the pool.`,
    );
  });

  it("ends at the outcome's own words when no fee was spent", () => {
    expect(card("registered", FREE).note).toBe(outcomeCopy("registered", NAME).note);
  });

  it("links to the handle's profile, except for a refunded registration", () => {
    expect(card("registered").profile).toEqual({ to: "/profile#mehow", text: `View ${NAME}` });
    expect(card("unknown").profile).toEqual({ to: "/profile#mehow", text: `Check ${NAME}` });
    expect(card("refunded").profile).toBeUndefined();
  });
});
