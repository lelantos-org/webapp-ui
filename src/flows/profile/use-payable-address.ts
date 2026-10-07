import { parseAddress } from "@lelantos-org/sdk";
import { useEffect, useState } from "react";

/// Whether `address` decodes in full (checksum, length, both curve points), so it can be paid.
/// `undefined` while it is being checked, and for no address.
export function usePayableAddress(address: string | undefined): boolean | undefined {
  const [checked, setChecked] = useState<{ address: string; payable: boolean }>();
  useEffect(() => {
    if (address === undefined) return;
    let current = true;
    const settle = (payable: boolean) => {
      if (current) setChecked({ address, payable });
    };
    parseAddress(address).then(
      () => settle(true),
      () => settle(false),
    );
    return () => {
      current = false;
    };
  }, [address]);
  return address !== undefined && checked?.address === address ? checked.payable : undefined;
}
