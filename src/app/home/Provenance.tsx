import { useId } from "react";

/// Plain-language note on where the balances come from. Claim only what is true: servers do see a decoy superset.
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
