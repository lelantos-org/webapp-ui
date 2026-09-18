/// Stroke glyphs for the Home action tiles; `shield` and `unshield` share an outline.
export function ActionIcon({ name }: { name: ActionIconName }) {
  return (
    <svg
      className="action__icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

export type ActionIconName = "shield" | "send" | "swap" | "unshield" | "link" | "govern" | "agent";

const POOL = "M12 3 20 6.2v6.1c0 4.3-3.4 7.3-8 8.7-4.6-1.4-8-4.4-8-8.7V6.2Z";

const PATHS: Record<ActionIconName, React.ReactNode> = {
  shield: (
    <>
      <path d={POOL} />
      <path d="M12 8v6" />
      <path d="m9 11 3-3 3 3" />
    </>
  ),
  unshield: (
    <>
      <path d={POOL} />
      <path d="M12 14V8" />
      <path d="m9 11 3 3 3-3" />
    </>
  ),
  send: (
    <>
      <path d="M4 12h13" />
      <path d="m12 6 6 6-6 6" />
      <path d="M20 4v16" />
    </>
  ),
  swap: (
    <>
      <path d="M17 3v13" />
      <path d="m21 12-4 4-4-4" />
      <path d="M7 21V8" />
      <path d="m3 12 4-4 4 4" />
    </>
  ),
  // Scales: the beam, the post on its base, and a pan hanging at each end.
  govern: (
    <>
      <path d="M5 8h14" />
      <path d="M12 5v14.5" />
      <path d="M8.5 19.5h7" />
      <path d="M2.5 12.5 5 8l2.5 4.5Z" />
      <path d="M16.5 12.5 19 8l2.5 4.5Z" />
    </>
  ),
  link: (
    <>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 6.5 12.8 4.7a4 4 0 1 1 5.7 5.7l-1.8 1.8" />
      <path d="M13 17.5 11.2 19.3a4 4 0 1 1-5.7-5.7l1.8-1.8" />
    </>
  ),
  agent: (
    <>
      <path d="M12 2.5V5" />
      <path d="M7 5h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      <path d="M9.5 9.5h.01" />
      <path d="M14.5 9.5h.01" />
      <path d="M12 14v3.5" />
      <path d="M7.5 17.5h9" />
    </>
  ),
};
