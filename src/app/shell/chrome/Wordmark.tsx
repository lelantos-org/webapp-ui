import { Link } from "react-router-dom";
import "./Wordmark.css";

/// Brand mark and name, linking home; `sub` labels a non-wallet route such as `/claim`.
export function Wordmark({ sub }: { sub?: string | undefined }) {
  return (
    <Link to="/" className="brand" aria-label="Lelantos home">
      <svg
        className="brand__mark"
        width="24"
        height="24"
        viewBox="0 0 32 32"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="16" cy="6.5" r="4" fill="currentColor" />
        <circle cx="6.5" cy="25.5" r="4" fill="currentColor" />
        <circle cx="25.5" cy="25.5" r="4" fill="currentColor" />
        <path
          d="M9 21 L12.4 14.2 M23 21 L19.6 14.2"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <span className="brand__name">LELANTOS</span>
      {sub ? <span className="brand__sub">{sub}</span> : null}
    </Link>
  );
}
