import type { Money, RegisterNameResult } from "@lelantos-org/sdk";
import type { NameRecord } from "@lelantos-org/sdk/advanced";
import type { ChainEntry, RegisteredAsset } from "@/config/chains";
import { findAsset } from "@/features/assets";
import { handleName, profilePath } from "@/features/names";
import { sameAddress } from "@/shared/lib/address";
import { feeText } from "./fees";

/// What became of a registration the relayer landed.
export type RegistrationOutcome =
  /// The handle is this account's.
  | "registered"
  /// The calls failed: the handle was not claimed and the input came back as a note.
  | "refunded"
  /// The receipt could not be read, and the registrar does not settle it either.
  | "unknown";

/// Reads the outcome from the result, falling back on the registrar's record of the label where
/// the receipt was unreadable: a record under this account's controller is this registration.
export function registrationOutcome(
  result: Pick<RegisterNameResult, "registered" | "controller">,
  record: Pick<NameRecord, "registered" | "controller"> | undefined,
): RegistrationOutcome {
  if (result.registered !== undefined) return result.registered ? "registered" : "refunded";
  if (!record?.registered) return "unknown";
  return sameAddress(record.controller, result.controller) ? "registered" : "refunded";
}

function moneyLabel(money: Money, assets: readonly RegisteredAsset[]): string | undefined {
  const asset = findAsset(assets, money.asset);
  return asset ? feeText(money.baseUnits, asset) : undefined;
}

/// The fees a landed registration spent, as one line. A refunded one paid the registrar nothing.
export function feesPaidLine(
  result: Pick<RegisterNameResult, "registrationFee" | "fees">,
  outcome: RegistrationOutcome,
  assets: readonly RegisteredAsset[],
): string | undefined {
  const parts: [string, Money | null][] = [
    ["registrar", outcome === "refunded" ? null : result.registrationFee],
    ["relayer", result.fees.relayer],
    ["pool", result.fees.protocol],
  ];
  const shown = parts.flatMap(([who, money]) => {
    const label = money ? moneyLabel(money, assets) : undefined;
    return label ? [`${label} to the ${who}`] : [];
  });
  if (shown.length === 0) return undefined;
  return `${outcome === "unknown" ? "Fees" : "Fees paid"}: ${shown.join(", ")}.`;
}

/// The words of a landed registration's card, per outcome. `name` is the handle as displayed; the
/// card carries it under the title as well. `link` words the way to the handle's profile, which a
/// refunded registration is not offered.
export function outcomeCopy(
  outcome: RegistrationOutcome,
  name: string,
): { title: string; unconfirmed: boolean; note: string; link: string | undefined } {
  switch (outcome) {
    case "registered":
      return {
        title: "Handle claimed",
        unconfirmed: false,
        note: `${name} is yours. Anyone can now look it up and pay the shielded address published under it. The handle and that address are public and stay in the chain's history.`,
        link: `View ${name}`,
      };
    case "refunded":
      return {
        title: "Handle not claimed",
        unconfirmed: true,
        note: `${name} was not registered: the transaction landed, but the registrar turned it down, most likely because someone claimed the handle first or its fee changed. The funds set aside for it are coming back to your shielded balance as a new note. Only the relayer's and the pool's fees were spent.`,
        link: undefined,
      };
    case "unknown":
      return {
        title: "Sent, outcome not known yet",
        unconfirmed: true,
        note: `The transaction landed, but its receipt could not be read, so it is not known whether ${name} was claimed. If it was, its profile shows the address you published. If it was not, the funds come back to your shielded balance and only fees were spent. Check the handle before trying again.`,
        link: `Check ${name}`,
      };
  }
}

/// A landed registration's card: its words with the fees it spent, and the link to the handle's
/// profile where one is offered.
export interface RegistrationCard {
  title: string;
  unconfirmed: boolean;
  note: string;
  profile: { to: string; text: string } | undefined;
}

export function registrationCard(
  result: Pick<RegisterNameResult, "label" | "registrationFee" | "fees">,
  outcome: RegistrationOutcome,
  chain: Pick<ChainEntry, "nameParents" | "tokens">,
): RegistrationCard {
  const copy = outcomeCopy(outcome, handleName(result.label, chain.nameParents));
  const fees = feesPaidLine(result, outcome, chain.tokens);
  return {
    title: copy.title,
    unconfirmed: copy.unconfirmed,
    note: fees ? `${copy.note} ${fees}` : copy.note,
    profile: copy.link ? { to: profilePath(result.label), text: copy.link } : undefined,
  };
}
