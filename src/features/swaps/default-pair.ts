import type { RegisteredAsset } from "@/config/chains";
import { DEFAULT_ASSET_ID } from "@/features/assets";

/// The asset the "to" side starts on.
///
/// This was the literal `"2"`. Asset ids are per-chain, so on any chain whose
/// registry has no id 2 that default resolved to no asset at all — and because
/// the quote request is only built once both sides resolve, the form sat there
/// looking complete and silently never quoted. Nothing surfaced it: there is no
/// error state for "the default you were given does not exist".
///
/// Picking the first asset that is not the "from" default keeps the pair
/// distinct, which is what the form needs to build a request at all. With fewer
/// than two assets there is no valid pair to offer; returning the default is
/// honest about that — the chain cannot swap, and the form stays inert rather
/// than pointing at something imaginary.
export function defaultSwapOut(assets: readonly RegisteredAsset[]): string {
  const other = assets.find((a) => a.id.toString() !== DEFAULT_ASSET_ID);
  return other ? other.id.toString() : DEFAULT_ASSET_ID;
}
