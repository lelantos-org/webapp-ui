import { shortAddr } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";

export function AddressBadge({ value, full }: { value?: string; full?: boolean }) {
  if (!value) return <span className="muted">—</span>;
  const v = value;
  async function copy() {
    try {
      await navigator.clipboard.writeText(v);
      toast.success("address copied");
    } catch {
      toast.error("clipboard unavailable");
    }
  }
  return (
    <button type="button" className="hex" title={v} onClick={copy}>
      {full ? v : shortAddr(v, 8)}
    </button>
  );
}
