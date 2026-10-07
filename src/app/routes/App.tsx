import { Suspense } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { ErrorCard } from "@/app/errors/ErrorCard";
import { RouteErrorBoundary } from "@/app/errors/RouteErrorBoundary";
import { Layout } from "@/app/shell/Layout";
import { LoadingFallback } from "@/app/shell/LoadingFallback";
import { ACTIONS, lazyNamed, STANDALONE } from "./routes";

const Home = lazyNamed(() => import("@/app/home/Home"), "Home");
const ActionScreen = lazyNamed(() => import("@/app/shell/ActionScreen"), "ActionScreen");

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

export function App() {
  return (
    <Layout>
      <RouteErrorBoundary>
        <Suspense fallback={<LoadingFallback hero />}>
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
            {STANDALONE.map(({ path, Screen }) => (
              <Route key={path} path={path} element={<Screen />} />
            ))}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    </Layout>
  );
}
