// The claim-link vault at `/links`.
//
// A route-level wrapper only: the screen — capacity meter, export, oldest-first
// rows, "drops in N days" — lives in `features/claim-links` on top of
// `link-vault/`, because Send by link renders two pieces of it too. Kept as a
// flow so `App` lazy-loads every routed screen through `flows/loaders.ts`, and
// so the route chunk takes only the vault: a loader importing the feature's
// barrel dynamically would pull its whole namespace, claim sweeping included.

import { ClaimLinkVault } from "@/features/claim-links";

export function LinksPage() {
  return <ClaimLinkVault />;
}
