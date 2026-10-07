import { Link } from "react-router-dom";
import { type Handle, profilePath } from "@/features/names";
import { Notice } from "@/shared/ui/Notice";

/// The handle this account already holds, with the way to its profile.
export function ClaimedHandle({ handle }: { handle: Handle }) {
  return (
    <Notice
      tone="neutral"
      title={`Your handle is ${handle.name}`}
      announce={false}
      actionPlacement="below"
      action={
        <Link to={profilePath(handle.label)} className="btn btn--outline">
          View its profile
        </Link>
      }
    >
      Anyone can pay you from its profile page. This browser remembers that it is yours.
    </Notice>
  );
}
