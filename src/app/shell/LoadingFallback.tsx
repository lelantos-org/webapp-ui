/// The Suspense fallback while a route's chunk loads: a card skeleton, under a
/// hero skeleton when the whole page is loading rather than one form in it.
export function LoadingFallback({ hero = false }: { hero?: boolean }) {
  return (
    <div role="status" aria-busy="true" aria-label="loading">
      {hero ? <div className="skel skel--hero" /> : null}
      <div className="skel skel--card" />
    </div>
  );
}
