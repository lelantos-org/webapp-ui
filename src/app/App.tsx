import { type ComponentType, lazy, Suspense } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "@/app/shell/Layout";
import {
  loadClaim,
  loadLinks,
  loadSend,
  loadSendLink,
  loadShield,
  loadSwap,
  loadUnshield,
} from "@/flows/loaders";
import { ErrorCard } from "@/shared/ui/ErrorCard";
import { RouteErrorBoundary } from "@/shared/ui/RouteErrorBoundary";

/// `lazy()` over a module's named export: the routes' modules export their
/// screen by name, not as a default.
function lazyNamed<K extends string, P extends object>(
  load: () => Promise<Record<K, ComponentType<P>>>,
  name: K,
) {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}

const Home = lazyNamed(() => import("@/app/Home"), "Home");
const ActionScreen = lazyNamed(() => import("@/app/shell/ActionScreen"), "ActionScreen");
const ClaimPage = lazyNamed(loadClaim, "ClaimPage");

/// The action screens, each its own route in the same shell: the connection
/// gate, the chain-keyed remount, the chunk fallback. See `ActionScreen`.
const ACTIONS = [
  { path: "/shield", width: "narrow", Screen: lazyNamed(loadShield, "DepositForm") },
  { path: "/send", width: "narrow", Screen: lazyNamed(loadSend, "TransferForm") },
  { path: "/send/link", width: "wide", Screen: lazyNamed(loadSendLink, "GenerateLinkForm") },
  { path: "/unshield", width: "narrow", Screen: lazyNamed(loadUnshield, "WithdrawForm") },
  { path: "/swap", width: "narrow", Screen: lazyNamed(loadSwap, "SwapForm") },
  { path: "/links", width: "vault", Screen: lazyNamed(loadLinks, "LinksPage") },
] as const;

/// Retired protocol-named paths, and the routes that serve them.
const MOVED = [
  ["/transfer", "/send"],
  ["/withdraw", "/unshield"],
  ["/send-link", "/send/link"],
] as const;

function NotFound() {
  return (
    <ErrorCard title="Page not found">
      <p className="muted">Nothing lives at this address.</p>
      <Link to="/" className="btn">
        Go to the wallet
      </Link>
    </ErrorCard>
  );
}

function PageFallback() {
  return (
    <div role="status" aria-busy="true" aria-label="loading">
      <div className="skel skel--hero" />
      <div className="skel skel--card" />
    </div>
  );
}

/// A retired path, sent on to the route that serves it.
///
/// `replace`, so the old path does not sit in history as a step that bounces
/// forward again on Back. Query and fragment ride along: nothing reads them on
/// these routes today, but a redirect that drops part of a URL is one that
/// breaks the first time something does.
function Moved({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}

export function App() {
  return (
    <Layout>
      <RouteErrorBoundary>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            {ACTIONS.map(({ path, width, Screen }) => (
              <Route
                key={path}
                path={path}
                element={
                  <ActionScreen width={width}>
                    <Screen />
                  </ActionScreen>
                }
              />
            ))}
            <Route path="/claim" element={<ClaimPage />} />
            {MOVED.map(([from, to]) => (
              <Route key={from} path={from} element={<Moved to={to} />} />
            ))}
            {/* Without this an unknown path rendered `<Layout>` around nothing,
                which reads as the app having failed rather than as a bad URL. */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    </Layout>
  );
}
