import { useEffect, useRef, useState } from "react";

const NOTICE_MS = 8000;

interface ChainIdentity {
  key: string;
  name: string;
}

/// Name of the chain just switched away from, for a few seconds after a switch; never on first load.
export function useChainChangeNotice(current: ChainIdentity | undefined): string | undefined {
  const previous = useRef<ChainIdentity | undefined>(undefined);
  const [left, setLeft] = useState<string | undefined>(undefined);

  useEffect(() => {
    const before = previous.current;
    previous.current = current;

    if (!before || !current) return;
    if (before.key === current.key) return;

    setLeft(before.name);
    const id = setTimeout(() => setLeft(undefined), NOTICE_MS);
    return () => clearTimeout(id);
  }, [current]);

  return left;
}
