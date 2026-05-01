import { useState } from "react";

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="row">
      <input
        className="fld__inp mono grow txt-xs"
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button type="button" className="btn nowrap" onClick={copy}>
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
