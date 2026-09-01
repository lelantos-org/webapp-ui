/// Drawn rather than typed. The obvious `⇅` sits off-centre in its own line box
/// — its ink is nowhere near the middle of the em, so no amount of flex
/// centring squares it up — and it renders at a different weight and size per
/// platform font. Sized to the 10px label text it sits beside.
export function FlipIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 4v16m0 0-3-3m3 3 3-3" />
      <path d="M17 20V4m0 0-3 3m3-3 3 3" />
    </svg>
  );
}
