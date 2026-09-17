/// Suspense fallback skeleton for a lazy route; `hero` adds the page hero.
export function LoadingFallback({ hero = false }: { hero?: boolean }) {
  return (
    <div role="status" aria-busy="true" aria-label="loading">
      {hero ? <div className="skel skel--hero" /> : null}
      <div className="skel skel--card" />
    </div>
  );
}
