import {
    Eip1193Signer,
    metamask,
    type NetworkPreset,
    Wallet,
    type WalletApi,
    WorkerPoolScanner,
} from "@lelantos-org/sdk";
import jubjubWasmUrl from "@lelantos-org/sdk/wasm/jubjub/wasm?url";
import jubjubModuleUrl from "@lelantos-org/sdk/wasm/jubjub?url";
import { env } from "@/config/env";
import { resolveMaspAddress } from "@/features/relayer/chains";
import { ensureFmdSubscription } from "@/features/wallet/fmd-subscription";
import { cacheNsk, getCachedNsk } from "@/features/wallet/nsk-session-cache";
import { instrumentWallet, timed } from "@/features/wallet/perf";
import { getProverWorker, preloadProverWorker } from "@/features/wallet/prover/proverWorker";
import { IdbNoteStore } from "@/features/wallet/stores/noteStore";
import { IdbTreePersistence } from "@/features/wallet/stores/treeStore";
import type { ConnectionBundle } from "@/features/wallet/use-connection";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("wallet:build");

async function preset(): Promise<NetworkPreset> {
    return {
        chainId: env.chainId,
        treeDepth: env.treeDepth,
        maspAddress: await resolveMaspAddress(env.chainId),
        relayerAddress: env.relayerAddress,
        relayerUrl: env.relayerUrl,
        fmdUrl: env.fmdUrl,
        permit2Address: env.permit2Address,
    };
}

export async function buildWallet(bundle: ConnectionBundle): Promise<WalletApi> {
    const ethAddr = bundle.address;
    const signer = new Eip1193Signer(bundle.provider, ethAddr, env.chainId);

    let nsk = getCachedNsk(env.chainId, ethAddr);
    if (nsk !== undefined) {
        log.info("nsk cache hit; skipping EIP-712 prompt", ethAddr);
    } else {
        log.info("nsk cache miss; requesting EIP-712 signature");
        nsk = await timed("metamask.deriveNskFromSigner", () =>
            metamask.deriveNskFromSigner(signer),
        );
        log.info("signature received");
        cacheNsk(env.chainId, ethAddr, nsk);
    }

    const network = await preset();
    const subscriptionId = await timed("fmd.ensureSubscription", () =>
        ensureFmdSubscription(env.fmdUrl, env.chainId, nsk, ethAddr),
    );
    const w = await timed("Wallet.connect", () =>
        Wallet.connect({
            network,
            nsk,
            signer,
            rpcUrl: env.rpcUrl,
            prover: getProverWorker(),
            noteStore: new IdbNoteStore(`notes:${env.chainId}:${ethAddr.toLowerCase()}`),
            treePersistence: new IdbTreePersistence(`tree:${env.chainId}:${ethAddr.toLowerCase()}`),
            scanner: new WorkerPoolScanner({
                factory: () =>
                    new Worker(new URL("@lelantos-org/sdk/scanner-worker", import.meta.url), {
                        type: "module",
                    }),
                wasm: { jubjubModuleUrl, jubjubWasmUrl },
            }),
            syncStrategy: { kind: "matches", subscriptionId },
        }),
    );
    instrumentWallet(w);
    log.info("ready", w.address);
    void preloadProverWorker();
    return w;
}
