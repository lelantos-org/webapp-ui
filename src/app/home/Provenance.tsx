import { useId } from "react";

/// What the figures on this page rest on, in place of a padlock.
///
/// Said without the vocabulary — no "viewing key", no "decrypted", no "decoys".
/// This is the first thing a first-time holder reads about why the numbers can
/// be trusted, and a claim they have to look up is not one they can weigh.
///
/// Only what the page can stand behind. Never "checked against block N": the
/// sync watermark the wallet reads carries no block number, and a legend of what
/// you can verify is the last place to print one we did not check.
///
/// Never "no server was asked what you hold", for the same reason. A subscribed
/// wallet registers an FMD detection key, and the discovery service answers with
/// a match set that holds this account's notes among decoys (`DECOY_FLOOR` in
/// `fmd-subscription.ts`). It is asked, and it learns a superset; what it cannot
/// do is tell which notes are yours or read an amount.
export function Provenance() {
  const titleId = useId();
  return (
    <section className="inset provenance" aria-labelledby={titleId}>
      <h2 className="caps provenance__t" id={titleId}>
        Where these numbers come from
      </h2>
      <p className="provenance__facts mono">
        Worked out on this device · Our servers only ever see your activity mixed in with other
        people&rsquo;s, never an amount
      </p>
      <p className="provenance__note">
        That cuts both ways: nobody here can see what you hold, so nobody here can get it back for
        you.
      </p>
    </section>
  );
}
