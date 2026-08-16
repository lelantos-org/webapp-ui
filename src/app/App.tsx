import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "@/shared/ui/Layout";
import { RouteErrorBoundary } from "@/shared/ui/RouteErrorBoundary";

const HomeLayout = lazy(() =>
  import("@/pages/HomeLayout").then((m) => ({ default: m.HomeLayout })),
);
const DepositForm = lazy(() =>
  import("@/features/actions/forms/DepositForm").then((m) => ({ default: m.DepositForm })),
);
const TransferForm = lazy(() =>
  import("@/features/actions/forms/TransferForm").then((m) => ({ default: m.TransferForm })),
);
const WithdrawForm = lazy(() =>
  import("@/features/actions/forms/WithdrawForm").then((m) => ({ default: m.WithdrawForm })),
);
const GenerateLinkForm = lazy(() =>
  import("@/features/claim-link/GenerateLinkForm").then((m) => ({ default: m.GenerateLinkForm })),
);
const SwapForm = lazy(() =>
  import("@/features/swaps/SwapForm").then((m) => ({ default: m.SwapForm })),
);
const ClaimPage = lazy(() =>
  import("@/features/claim-link/claim-page").then((m) => ({ default: m.ClaimPage })),
);

function PageFallback() {
  return (
    <div role="status" aria-busy="true" aria-label="loading">
      <div className="skel skel--hero" />
      <div className="skel skel--card" />
    </div>
  );
}

export function App() {
  return (
    <Layout>
      <RouteErrorBoundary>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<HomeLayout />}>
              <Route index element={<DepositForm />} />
              <Route path="transfer" element={<TransferForm />} />
              <Route path="withdraw" element={<WithdrawForm />} />
              <Route path="swap" element={<SwapForm />} />
              <Route path="send-link" element={<GenerateLinkForm />} />
            </Route>
            <Route path="/claim" element={<ClaimPage />} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    </Layout>
  );
}
