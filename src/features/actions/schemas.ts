import { ADDRESS_HRP } from "@lelantos-org/sdk";
import { z } from "zod";
import { isDecimalString, isPositiveIntegerString } from "@/shared/lib/format";

const amount = z.string().refine(isDecimalString, "must be a positive number");
const ethAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected 0x-prefixed address");
const shieldedAddress = z
  .string()
  .regex(new RegExp(`^${ADDRESS_HRP}1[0-9a-z]{38,}$`), `expected bech32 ${ADDRESS_HRP}1… address`);
const asset = z.string().refine(isPositiveIntegerString, "must be a positive integer").default("1");

/// `asEth: true` switches withdraw to the WETH-bridge entry point
/// (`MASP.withdrawEth`). Only valid when the selected asset is the
/// chain's WETH; the form layer hides the toggle otherwise. Deposits
/// have no equivalent — users wrap ETH→WETH off-pool before depositing.
const asEth = z.coerce.boolean().default(false);

export const depositSchema = z.object({ amount, asset, asEth });
export type DepositInput = z.infer<typeof depositSchema>;

export const transferSchema = z.object({ to: shieldedAddress, amount, asset });
export type TransferInput = z.infer<typeof transferSchema>;

export const withdrawSchema = z.object({ to: ethAddress, amount, asset, asEth });
export type WithdrawInput = z.infer<typeof withdrawSchema>;

export const generateLinkSchema = z.object({ asset, amount });
export type GenerateLinkInput = z.infer<typeof generateLinkSchema>;
