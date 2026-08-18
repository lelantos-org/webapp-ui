import { shortAddr } from "@/shared/lib/format";
import { copyWithToast } from "@/shared/lib/use-copy";

export function AddressBadge({ value, full }: { value?: string; full?: boolean }) {
  if (!value) return <span className="muted">—</span>;
  return (
    <button
      type="button"
      className="hex"
      title={value}
      onClick={() => void copyWithToast(value, "address copied")}
    >
      {full ? value : shortAddr(value, 8)}
    </button>
  );
}
