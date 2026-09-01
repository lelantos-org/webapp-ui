// The picker's native-coin entries.
//
// One per WETH-tagged asset id, not one overall. `NativeAdapter` pins the token
// it wraps, never the asset id — `depositNative` takes `publicAssetId` from the
// request and only requires the pull to measure against wrapped native, and
// `withdrawNative` measures the same delta on the way out. A chain that
// registers WETH twice, once as plain custody and once bound to a yield venue,
// therefore has two native paths that differ only in the id they name, and
// resolving "ETH" to whichever came first would silently deposit into one of
// them.

/// A picker value naming the WETH id to spend native coin through.
///
/// Prefixed rather than bare so it cannot collide with a plain asset id, which
/// is the same decimal string.
export function ethOption(assetId: string | bigint): string {
  return `eth:${assetId}`;
}

/// The asset id inside an `ethOption` value, or `undefined` for a plain one.
export function parseEthOption(value: string): string | undefined {
  return value.startsWith("eth:") ? value.slice("eth:".length) : undefined;
}
