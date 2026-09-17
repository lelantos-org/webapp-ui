import { prfOutputToNsk } from "@lelantos-org/sdk/primitives";
import { userMessage } from "@/shared/lib/errors";
import { createStore } from "@/shared/lib/external-store";
import { createLogger } from "@/shared/lib/logger";
import { cacheNsk } from "../key-cache/nsk-session-cache";
import type { ConnectionStatus } from "../types";
import {
  isAttached,
  markAttached,
  passkeyAccountKey,
  releaseAttachment,
  rememberChainId,
  rememberCredential,
  storedChainId,
  storedCredential,
} from "./credential-storage";
import { createAndProvePasskey, PrfUnsupportedError, passkeysAvailable } from "./prf";

const log = createLogger("passkey");

export interface PasskeyState {
  status: ConnectionStatus;
  credentialId?: string | undefined;
  /// The chain this session selected; undefined until one is chosen.
  chainId?: bigint | undefined;
  error?: string | undefined;
}

const initial: PasskeyState = { status: "idle" };

/// The session implied by storage, read synchronously at construction.
function restored(): PasskeyState {
  if (!passkeysAvailable()) return initial;
  if (!isAttached()) return initial;
  const cred = storedCredential();
  if (!cred) return initial;
  log.info("resuming passkey session");
  return { status: "connected", credentialId: cred.id, chainId: storedChainId() };
}

class PasskeyStore {
  private readonly store = createStore<PasskeyState>(restored());

  subscribe = (listener: () => void): (() => void) => this.store.subscribe(listener);

  getState = (): PasskeyState => this.store.getState();

  private set(patch: Partial<PasskeyState>): void {
    this.store.setState({ ...this.store.getState(), ...patch });
  }

  /// Attach without an assertion: WebAuthn has no silent read, so the first unlock happens at build.
  private attach(credentialId: string): void {
    this.set({
      status: "connected",
      credentialId,
      chainId: storedChainId(),
      error: undefined,
    });
  }

  /// Attach to the credential already on this device, or enrol a new one.
  attachOrEnrol = async (): Promise<void> => {
    const cred = storedCredential();
    if (cred) {
      // Never re-enrol: a second credential derives a second nsk and strands the first.
      markAttached();
      this.attach(cred.id);
      return;
    }
    await this.connect();
  };

  /// Enrol a new passkey and attach to it.
  connect = async (label?: string): Promise<void> => {
    if (!passkeysAvailable()) {
      this.set({ status: "error", error: "passkeys are not available in this browser" });
      return;
    }
    this.set({ status: "connecting", error: undefined });
    try {
      const { credentialId, prf } = await createAndProvePasskey(label);
      rememberCredential({ id: credentialId, createdAt: Date.now() });
      cacheNsk(passkeyAccountKey(credentialId), prfOutputToNsk(prf));
      this.attach(credentialId);
    } catch (e) {
      const unsupported = e instanceof PrfUnsupportedError;
      if (unsupported) log.warn("authenticator has no PRF; passkeys unusable here");
      else log.warn("passkey enrolment failed", e);
      this.set({
        status: "error",
        error: unsupported && e instanceof Error ? e.message : userMessage(e),
      });
    }
  };

  selectChain = (chainId: bigint): void => {
    rememberChainId(chainId);
    this.set({ chainId });
  };

  disconnect = (): void => {
    releaseAttachment();
    this.set({ status: "idle", credentialId: undefined, error: undefined });
  };

  /// Test seam, mirroring `eip1193Store.resetForTest`.
  resetForTest = (): void => {
    this.store.setState(initial);
  };
}

export const passkeyStore = new PasskeyStore();
