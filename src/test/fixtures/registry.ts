// The two services' accounts of a chain, as `/v1/chains` (registry-webserver)
// and the relayer's `/chains` serve them.

export const MASP = "0x0165878A594ca255338adfa4d48449f69242Eb8F";
export const RELAYER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

/// The deployment's account of a chain, fully described.
export const deployment = (chainId: number) => ({
  chainId,
  chainName: "base",
  rpcUrl: "https://rpc.example",
  maspAddress: MASP,
  treeDepth: 10,
});

/// One relayer's account of itself, agreeing with `deployment`.
export const relayer = (chainId: number) => ({
  chainId,
  maspAddress: MASP,
  treeDepth: 10,
  relayerAddress: RELAYER,
});
