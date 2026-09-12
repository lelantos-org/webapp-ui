// Browser-API stubs jsdom does not provide.
//
// Installed with `vi.stubGlobal`, which the test config undoes after every test
// (`unstubGlobals`), so none of these needs a matching teardown.

import { vi } from "vitest";

/// `prefers-reduced-motion: reduce` on (the default) or off.
///
/// On is what most component tests want: transitions collapse to their end
/// state, so a test need not wait them out. The stub answers every media query
/// the same way — deliberately indiscriminate, since the components under test
/// ask one query each, and a stub that parsed the query would be a second
/// implementation to keep in step with the CSS.
export function stubReducedMotion(reduce = true): void {
  vi.stubGlobal("matchMedia", (media: string) => ({ media, matches: reduce }));
}

type Ceremony = (options: never) => Promise<unknown>;

/// A secure context with WebAuthn: `PublicKeyCredential` defined and
/// `navigator.credentials` running the given ceremonies, each of which answers
/// `null` (a dismissed prompt) unless the test supplies it.
export function stubWebAuthn(ceremonies: { create?: Ceremony; get?: Ceremony } = {}): void {
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("PublicKeyCredential", class {});
  vi.stubGlobal("navigator", {
    ...navigator,
    credentials: { create: async () => null, get: async () => null, ...ceremonies },
  });
}
