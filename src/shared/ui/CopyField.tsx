import { useCopy } from "@/shared/lib/use-copy";

export function CopyField({ value }: { value: string }) {
  const { copy, copied } = useCopy(value);

  return (
    <div className="row">
      <input
        className="fld__inp mono grow txt-xs"
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button type="button" className="btn nowrap" onClick={() => void copy()}>
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
