// The route chunks: one loader per flow.
//
// The single place a flow is imported, and only ever dynamically.
// `app/routes/routes.ts` wraps each loader in `lazy()`, and Home calls the same
// loaders to warm a chunk on intent. Sharing the function rather than restating the path is what keeps the
// prefetch and the route on one chunk: a second spelling of the path is a second
// chance to warm a chunk the route never asks for.
//
// Each loader names the flow's screen module, so it pulls in that flow and
// whatever it builds on — never a sibling flow. `vite/chunks.ts` names the chunk
// after the flow's folder.

/// Shield: move an asset from the public wallet into the pool (`/shield`).
export const loadShield = () => import("./shield/DepositForm");
/// Send: a shielded transfer to another shielded address (`/send`).
export const loadSend = () => import("./send/TransferForm");
/// Unshield: withdraw from the pool to a public address (`/unshield`).
export const loadUnshield = () => import("./unshield/WithdrawForm");
/// Swap: trade one shielded asset for another (`/swap`).
export const loadSwap = () => import("./swap/SwapForm");
/// Send by link: fund an ephemeral wallet and share its key as a URL (`/send/link`).
export const loadSendLink = () => import("./send-link/GenerateLinkForm");
/// Claim: the recipient's side of a claim link (`/claim`).
export const loadClaim = () => import("./claim/ClaimPage");
/// The claim-link vault (`/links`).
export const loadLinks = () => import("./links/LinksPage");
/// Governance: proposals, voting, delegation and new proposals (`/governance`).
export const loadGovernance = () => import("./governance/GovernanceRoutes");
