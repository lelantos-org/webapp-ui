import { useEffect } from "react";
import { useOpNeedsTab } from "@/features/tx";

/// Asks before the tab closes or reloads while a transaction is running that doing so would stop:
/// one still being proved, or a deposit the wallet has not sent yet.
export function useLeaveGuard(): void {
  const needed = useOpNeedsTab();
  useEffect(() => {
    if (!needed) return;
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chromium shows its prompt only when this is set.
      e.returnValue = true;
    };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [needed]);
}
