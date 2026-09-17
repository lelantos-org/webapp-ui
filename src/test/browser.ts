import { vi } from "vitest";

/// `prefers-reduced-motion: reduce` on (the default) or off; every media query answers the same.
export function stubReducedMotion(reduce = true): void {
  vi.stubGlobal("matchMedia", (media: string) => ({ media, matches: reduce }));
}

type Ceremony = (options: never) => Promise<unknown>;

/// A secure context with WebAuthn; unsupplied ceremonies answer `null` (a dismissed prompt).
export function stubWebAuthn(ceremonies: { create?: Ceremony; get?: Ceremony } = {}): void {
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("PublicKeyCredential", class {});
  vi.stubGlobal("navigator", {
    ...navigator,
    credentials: { create: async () => null, get: async () => null, ...ceremonies },
  });
}
