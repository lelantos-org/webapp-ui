// Route chunk loaders, one per flow; the only place a flow is imported. Routes and prefetch share them.

/// Shield: move an asset from the public wallet into the pool (`/shield`).
export const loadShield = () => import("./shield/DepositForm");
/// Send: a shielded transfer to another shielded address (`/send`).
export const loadSend = () => import("./send/TransferForm");
/// Unshield: withdraw from the pool to a public address (`/unshield`).
export const loadUnshield = () => import("./unshield/WithdrawForm");
/// Swap: trade one shielded asset for another (`/swap`).
export const loadSwap = () => import("./swap/SwapForm");
/// Request: a link asking for a shielded transfer to this wallet (`/request`).
export const loadRequest = () => import("./request/RequestForm");
/// Send by link: fund an ephemeral wallet and share its key as a URL (`/send/link`).
export const loadSendLink = () => import("./send-link/GenerateLinkForm");
/// Claim: the recipient's side of a claim link (`/claim`).
export const loadClaim = () => import("./claim/ClaimPage");
/// The claim-link vault (`/links`).
export const loadLinks = () => import("./links/LinksPage");
/// Governance: proposals, voting, delegation and new proposals (`/governance`).
export const loadGovernance = () => import("./governance/GovernanceRoutes");
/// Agents: shielded wallets funded here and handed to a process (`/agents`).
export const loadAgents = () => import("./agents/AgentsRoutes");
/// Handle: claim a public name for a shielded address (`/name`).
export const loadName = () => import("./name/ClaimNameForm");
/// Profile: a handle's public page, with its address and a way to pay it (`/profile`).
export const loadProfile = () => import("./profile/ProfilePage");
