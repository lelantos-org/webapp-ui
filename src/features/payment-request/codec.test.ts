import { describe, expect, it } from "vitest";
import { SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import {
  encodePaymentRequest,
  type PaymentRequest,
  parsePaymentRequest,
  paymentRequestUrl,
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
    expect(parsePaymentRequest(`#${encodePaymentRequest(REQUEST)}&memo=rent`)).toEqual(REQUEST);
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
