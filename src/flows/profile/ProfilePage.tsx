import { useEffect } from "react";
import { preloadQrCode } from "@/shared/ui/QrCode";
import { ProfileBody } from "./components/ProfileBody";
import { useProfile } from "./use-profile";
import "./profile.css";

/// A handle's public page: its published shielded address, and a way to pay it. The handle is in
/// the fragment, so the server never learns which profile is open.
export function ProfilePage() {
  const { view, typed, name, chainName, parents, retryRecord, retryNetworks } = useProfile();

  // The code is the page's output: have its encoder in hand before the record lands.
  useEffect(() => void preloadQrCode(), []);

  return (
    <div className="profile-page">
      <div className="profile-hero">
        <h1 className="profile-hero__t">{name ?? "Handle profile"}</h1>
        <p className="profile-hero__sub">
          {name !== undefined && chainName !== undefined
            ? `A Lelantos handle on ${chainName}`
            : "A public name for a shielded address"}
        </p>
      </div>

      <ProfileBody
        view={view}
        typed={typed}
        parents={parents}
        onRetryRecord={retryRecord}
        onRetryNetworks={retryNetworks}
      />

      <p className="footnote profile-page__foot">
        The handle sits after the # in this page's address, which a browser does not send to the
        site it loads the page from.
      </p>
    </div>
  );
}
