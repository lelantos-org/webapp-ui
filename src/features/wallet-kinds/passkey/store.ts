// Authoritative passkey session state.
//
// The counterpart of `eip1193/store.ts`, and deliberately the same shape: a
// `createStore` behind `subscribe` / `getState`, read through `useStore`. It is
// much the smaller of the two, because a passkey emits no events — there is no
// `accountsChanged` to follow, no chain to be moved out from under the app, and
// no extension to disappear mid-session.
//
// What it does own that the EIP-1193 store does not is the selected chain. An
// injected wallet carries its own network; a passkey has none, so the choice
// has to live somewhere, and this is the only place that knows the session
// exists.

import { prfOutputToNsk } from "@lelantos-org/sdk/keys";
import { userMessage } from "@/shared/lib/errors";
import { createStore } from "@/shared/lib/external-store";
import { createLogger } from "@/shared/lib/logger";
import { cacheNsk } from "../key-cache/nsk-session-cache";
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

export type PasskeyStatus = "idle" | "connecting" | "connected" | "error";

export interface PasskeyState {
  status: PasskeyStatus;
  credentialId?: string | undefined;
  /// The chain this session selected. Undefined until one is chosen, which
  /// `ChainProvider` resolves to the first registry entry.
  chainId?: bigint | undefined;
  error?: string | undefined;
  /// True when the authenticator has already been shown not to support PRF, so
  /// the picker can stop offering a path that cannot work here.
  unsupported?: boolean;
}

const initial: PasskeyState = { status: "idle" };

/// The session implied by what is already in storage.
///
/// Seeded at construction rather than from a mount effect: unlike
/// `eth_accounts`, this is pure synchronous storage, so there is nothing to
/// await — and reading it during the first render avoids a second pass over
/// the whole tree for every returning passkey user (`ChainProvider` subscribes
/// to this store, and it wraps the app).
function restored(): PasskeyState {
  if (!passkeysAvailable()) return initial;
  // Both, not just the credential: one that is known but detached is a wallet
  // this device can return to, not a session to resume.
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

  /// Attach to a credential without prompting.
  ///
  /// Deliberately *not* an assertion: unlike `eth_accounts`, WebAuthn has no
  /// silent read, and running one here would put a Touch ID prompt on page
  /// load. The session is marked connected on the strength of the stored
  /// credential id, and the first unlock happens when the wallet is built —
  /// where the "deriving" panel already explains what is being asked for.
  private attach(credentialId: string): void {
    this.set({
      status: "connected",
      credentialId,
      chainId: storedChainId(),
      error: undefined,
    });
  }

  /// Attach to the credential already on this device, or enrol a new one.
  ///
  /// One entry point, because the caller's intent is the same either way and
  /// the difference — two prompts or none — is not theirs to decide.
  attachOrEnrol = async (): Promise<void> => {
    const cred = storedCredential();
    if (cred) {
      // Reattach, never re-enrol: a second credential would derive a second nsk
      // and leave whatever the first one holds unreachable.
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
      // The probe already evaluated the pair the build is about to; spending its
      // answer here is the difference between two prompts at enrolment and
      // three. Best-effort: a storage failure costs the prompt back, not the
      // enrolment.
      cacheNsk(passkeyAccountKey(credentialId), prfOutputToNsk(prf));
      this.attach(credentialId);
    } catch (e) {
      // A missing PRF extension is not a retryable failure, so it is latched:
      // the picker stops offering passkeys on this device rather than inviting
      // the user to try the same authenticator again.
      const unsupported = e instanceof PrfUnsupportedError;
      if (unsupported) log.warn("authenticator has no PRF; passkeys unusable here");
      else log.warn("passkey enrolment failed", e);
      // Rendered verbatim by the wallet picker. The PRF message is written for
      // the user and is kept whole: it is longer than `userMessage` passes
      // through, and the generic line it would become says nothing about what
      // to try instead.
      this.set({
        status: "error",
        error: unsupported && e instanceof Error ? e.message : userMessage(e),
        unsupported,
      });
    }
  };

  selectChain = (chainId: bigint): void => {
    rememberChainId(chainId);
    this.set({ chainId });
  };

  disconnect = (): void => {
    // Releases the latch only. The credential stays recorded so the next connect
    // returns to the same wallet; see `credential-storage`.
    releaseAttachment();
    this.set({ status: "idle", credentialId: undefined, error: undefined });
  };

  /// Test seam, mirroring `eip1193Store.resetForTest`.
  resetForTest = (): void => {
    this.store.setState(initial);
  };
}

export const passkeyStore = new PasskeyStore();
