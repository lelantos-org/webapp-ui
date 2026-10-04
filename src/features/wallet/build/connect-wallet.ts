import { connect, type EthSigner, type WalletApi } from "@lelantos-org/sdk";
import type { Field } from "@lelantos-org/sdk/primitives";
import type { ChainEntry } from "@/config/chains";
import { env } from "@/config/env";
import { sharedProver } from "../prover/prover-worker";
import { type FullSyncReason, resolveSyncStrategy } from "../sync/fmd-subscription";
import { createScanner, disposeScanner, holdScanner } from "../sync/scanner";
import { networkPreset } from "./network-preset";
import { instrumentWallet, timed } from "./perf";

type ConnectOptions = Parameters<typeof connect>[0];

export interface ConnectWalletArgs {
  chain: ChainEntry;
  nsk: Field;
  /// What the FMD subscription is cached under: the session's account key, or a wallet's address.
  account: string;
  /// The EVM signer. Without one the wallet is read-only: it can spend, not shield.
  signer: EthSigner | undefined;
  storage: NonNullable<ConnectOptions["storage"]>;
  /// Scanner workers; the default sizes to the device.
  scannerSize?: number;
  /// Split change against the denomination ladder. A privacy setting: it changes what the chain sees.
  denominations?: boolean;
}

export interface ConnectedWallet {
  wallet: WalletApi;
  /// Set when notes are found by a full scan rather than through the discovery service.
  fullSync: FullSyncReason | undefined;
}

/// Connects a wallet over `nsk`: resolves its sync strategy, gives it a scanner and the shared
/// prover, and frees the scanner if the connection fails. Callers must `releaseScanner` the wallet.
export async function connectWallet(args: ConnectWalletArgs): Promise<ConnectedWallet> {
  const { chain, nsk, signer } = args;
  // Strategy and scanner are both required, or `connect` scans the whole pool on the main thread.
  const plan = await timed("fmd.resolveSyncStrategy", () =>
    resolveSyncStrategy(env.fmdUrl, chain.chainId, nsk, args.account),
  );

  // Created outside `connect` so its eagerly spawned workers are disposed if `connect` throws.
  const scanner = createScanner(args.scannerSize);
  let wallet: WalletApi;
  try {
    wallet = await timed("connect", () =>
      connect({
        network: networkPreset(chain),
        rpcUrl: chain.readRpcUrl,
        nsk,
        ...(args.denominations ? { denominations: true } : {}),
        ...(signer ? { signer } : { readOnly: true as const }),
        // Its 4x6 artifacts must match `connect`'s default shape, or every proof has the wrong arity.
        prover: sharedProver(),
        storage: args.storage,
        scanner,
        syncStrategy: plan.strategy,
      }),
    );
  } catch (e) {
    await disposeScanner(scanner);
    throw e;
  }

  holdScanner(wallet, scanner);
  instrumentWallet(wallet);
  return { wallet, fullSync: plan.fallback };
}
