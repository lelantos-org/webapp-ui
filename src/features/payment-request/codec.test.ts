import { describe, expect, it } from "vitest";
import { SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import {
  encodePaymentRequest,
  type PaymentRequest,
  parsePaymentRequest,
  parseRecipientRequest,
  paymentRequestUrl,
  recipientRequestPath,
} from "./codec";

const REQUEST: PaymentRequest = {
  chainId: 31337n,
  to: SHIELDED_ADDRESS,
  asset: 3n,
  amount: "12.5",
};

describe("payment request codec", () => {
  it("round-trips through the fragment", () => {
    expect(parsePaymentRequest(`#${encodePaymentRequest(REQUEST)}`)).toEqual(REQUEST);
    expect(parsePaymentRequest(encodePaymentRequest(REQUEST))).toEqual(REQUEST);
  });

  it("puts the request in the fragment of the Send page", () => {
    expect(paymentRequestUrl("https://wallet.example", REQUEST)).toBe(
      `https://wallet.example/send#to=${SHIELDED_ADDRESS}&asset=3&amount=12.5&chain=31337`,
    );
  });

  it("ignores keys it does not know", () => {
    expect(parsePaymentRequest(`#${encodePaymentRequest(REQUEST)}&ref=rent`)).toEqual(REQUEST);
  });

  it("round-trips a memo, whatever characters it holds", () => {
    for (const memo of ["rent", "INV-0042 · grazie", "a=b&c#d %20+", "十月份房租", "line\nbreak"]) {
      const request = { ...REQUEST, memo };
      expect(parsePaymentRequest(`#${encodePaymentRequest(request)}`)).toEqual(request);
    }
    expect(paymentRequestUrl("https://wallet.example", { ...REQUEST, memo: "rent, 3B" })).toBe(
      `https://wallet.example/send#to=${SHIELDED_ADDRESS}&asset=3&amount=12.5&chain=31337` +
        "&memo=rent%2C+3B",
    );
  });

  it("reads an empty memo as none", () => {
    expect(parsePaymentRequest(`#${encodePaymentRequest(REQUEST)}&memo=`)).toEqual(REQUEST);
    expect(encodePaymentRequest({ ...REQUEST, memo: "" })).toBe(encodePaymentRequest(REQUEST));
  });

  it.each([
    ["an empty fragment", ""],
    ["a missing address", "asset=3&amount=12.5&chain=31337"],
    ["a missing amount", `to=${SHIELDED_ADDRESS}&asset=3&chain=31337`],
    ["a missing chain", `to=${SHIELDED_ADDRESS}&asset=3&amount=12.5`],
    ["a signed amount", `to=${SHIELDED_ADDRESS}&asset=3&amount=-1&chain=31337`],
    ["a grouped amount", `to=${SHIELDED_ADDRESS}&asset=3&amount=1,000&chain=31337`],
    ["an exponent amount", `to=${SHIELDED_ADDRESS}&asset=3&amount=1e9&chain=31337`],
    ["a hex asset id", `to=${SHIELDED_ADDRESS}&asset=0x3&amount=1&chain=31337`],
    ["chain zero", `to=${SHIELDED_ADDRESS}&asset=3&amount=1&chain=0`],
    ["a claim-link fragment", "7a69:deadbeef"],
  ])("rejects %s", (_, fragment) => {
    expect(parsePaymentRequest(`#${fragment}`)).toBeUndefined();
  });
});

describe("recipient-only request", () => {
  it("round-trips through the fragment of the Send page", () => {
    const path = recipientRequestPath(SHIELDED_ADDRESS);
    expect(path).toBe(`/send#to=${SHIELDED_ADDRESS}`);
    expect(parseRecipientRequest(path.slice(path.indexOf("#")))).toEqual({ to: SHIELDED_ADDRESS });
    expect(parseRecipientRequest(`to=${SHIELDED_ADDRESS}`)).toEqual({ to: SHIELDED_ADDRESS });
  });

  it("ignores keys that are not a request's", () => {
    expect(parseRecipientRequest(`#to=${SHIELDED_ADDRESS}&ref=profile`)).toEqual({
      to: SHIELDED_ADDRESS,
    });
  });

  it("is not a full request, and a full request is not one", () => {
    expect(parsePaymentRequest(`#to=${SHIELDED_ADDRESS}`)).toBeUndefined();
    expect(parseRecipientRequest(`#${encodePaymentRequest(REQUEST)}`)).toBeUndefined();
  });

  it.each([
    ["an empty fragment", ""],
    ["an empty address", "to="],
    ["an asset", `to=${SHIELDED_ADDRESS}&asset=3`],
    ["an amount", `to=${SHIELDED_ADDRESS}&amount=12.5`],
    ["a chain", `to=${SHIELDED_ADDRESS}&chain=31337`],
    ["a memo", `to=${SHIELDED_ADDRESS}&memo=rent`],
    ["an empty amount", `to=${SHIELDED_ADDRESS}&amount=`],
  ])("does not read a fragment with %s as one", (_, fragment) => {
    expect(parseRecipientRequest(`#${fragment}`)).toBeUndefined();
  });
});
