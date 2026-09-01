import { useEffect, useRef, useState } from "react";

/// How long the "network changed" notice stays up.
///
/// Long enough to be read after the eye has gone back to a form that just
/// emptied itself, short enough that it is gone before the next action.
const NOTICE_MS = 8000;

interface ChainIdentity {
  key: string;
  name: string;
}

/// Names the chain the user just left, for the few seconds after a switch.
///
/// The form below is keyed on the chain and is recreated wholesale when it
/// changes, because asset ids are only unique within a chain and
/// carrying one across silently rebinds it (see the comment on the `<Fragment>`
/// in `HomeLayout`). That is the right behaviour and the wrong experience: from
/// the outside, typed input vanishes for no stated reason.
///
/// Reported after the fact rather than confirmed before it, because the switch
/// that actually surprises people comes from the wallet's own network menu.
/// That path never passes through the in-app switcher and cannot be
/// intercepted, so a pre-switch prompt would cover only the case the user
/// already knows they asked for.
///
/// Returns `undefined` on first mount and once the notice expires. Never fires
/// for the initial chain: arriving somewhere is not a change.
export function useChainChangeNotice(current: ChainIdentity | undefined): string | undefined {
  const previous = useRef<ChainIdentity | undefined>(undefined);
  const [left, setLeft] = useState<string | undefined>(undefined);

  useEffect(() => {
    const before = previous.current;
    previous.current = current;

    // First resolution of the chain, not a switch.
    if (!before || !current) return;
    if (before.key === current.key) return;

    setLeft(before.name);
    const id = setTimeout(() => setLeft(undefined), NOTICE_MS);
    return () => clearTimeout(id);
  }, [current]);

  return left;
}
