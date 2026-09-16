/// React Router v7 behaviours the app opts into early.
///
/// Its own module so the test render helpers share the exact flags the app
/// boots with: a `MemoryRouter` without them renders differently (no
/// `startTransition` around navigation state) and warns on every mount, which
/// buries a real warning among the noise.
export const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
