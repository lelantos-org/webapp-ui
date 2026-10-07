import { Link } from "react-router-dom";
import { handleName, handleRefusalText } from "@/features/names";
import { echoed, type ProfileView } from "../profile-view";
import { ProfileCard } from "./ProfileCard";
import { ProfileStatus, ProfileWait } from "./ProfileStatus";

export interface ProfileBodyProps {
  view: ProfileView;
  /// The fragment as written, quoted back when it is refused.
  typed: string;
  parents: readonly string[];
  onRetryRecord(): void;
  onRetryNetworks(): void;
}

/// The card for the page's state: the wait, the address to pay, or why there is nothing to pay.
export function ProfileBody({
  view,
  typed,
  parents,
  onRetryRecord,
  onRetryNetworks,
}: ProfileBodyProps) {
  switch (view.kind) {
    case "loading-networks":
      return <ProfileWait title="Loading the networks" />;

    case "looking-up":
      return <ProfileWait title={`Looking up ${view.name}`} />;

    case "ready":
      return <ProfileCard name={view.name} address={view.address} />;

    case "not-found":
      return (
        <ProfileStatus
          tone="warn"
          title={`${view.name} is not claimed`}
          action={
            <Link to="/name" className="btn btn--outline btn--sm">
              Claim a handle
            </Link>
          }
        >
          Nobody has registered this handle, so there is nothing to pay. Check the spelling with
          whoever gave it to you.
        </ProfileStatus>
      );

    case "unpublished":
      return (
        <ProfileStatus tone="warn" title={`${view.name} publishes no address`}>
          The handle is registered, but its holder has cleared the address it pointed to. Ask them
          for a current one.
        </ProfileStatus>
      );

    case "invalid":
      return (
        <ProfileStatus tone="err" title={`${view.name} can't be paid`}>
          The handle is registered, but what it publishes is not a shielded address, so no payment
          is offered here. Do not send to it.
        </ProfileStatus>
      );

    case "refused":
      return view.problem === "parent" ? (
        <ProfileStatus tone="err" title="This name is not served here">
          “{echoed(typed)}” is under a name this app does not serve, so nothing was looked up for
          it. {handleRefusalText("parent", parents)}
        </ProfileStatus>
      ) : (
        <ProfileStatus tone="err" title="This is not a handle">
          “{echoed(typed)}” can't be a handle, so nothing was looked up for it.{" "}
          {handleRefusalText("label", parents)}
        </ProfileStatus>
      );

    case "no-handle":
      return (
        <ProfileStatus tone="warn" title="No handle in this link">
          A profile link ends in # and a handle, such as /profile#{handleName("mehow", parents)}.
        </ProfileStatus>
      );

    case "no-registrar":
      return (
        <ProfileStatus tone="warn" title="Handles are not available">
          None of the networks this app serves runs a handle registrar, so there are no profiles to
          show.
        </ProfileStatus>
      );

    case "networks-failed":
      return (
        <ProfileStatus tone="err" title="Couldn't load the networks" onRetry={onRetryNetworks}>
          The list of networks this app serves did not load, so the handle could not be looked up.
        </ProfileStatus>
      );

    case "read-failed":
      return (
        <ProfileStatus tone="err" title={`Couldn't look up ${view.name}`} onRetry={onRetryRecord}>
          The network did not answer, so nothing is known about this handle yet. This says nothing
          about whether it is claimed.
        </ProfileStatus>
      );
  }
}
