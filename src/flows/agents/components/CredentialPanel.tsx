import { useState } from "react";
import {
  type CredentialFormat,
  markAgentCopied,
  render,
  type StoredAgent,
} from "@/features/agents";
import { copyWithToast } from "@/shared/hooks/use-copy";
import { Notice } from "@/shared/ui/Notice";
import "../agents.css";

/// The agent credential as JSON or `.env`. Copy only, never a download, so the
/// spending key is not left on disk; the key is masked until revealed.
export function CredentialPanel({ agent }: { agent: StoredAgent }) {
  const [format, setFormat] = useState<CredentialFormat>("json");
  const [revealed, setRevealed] = useState(false);
  const shown = render(agent, format, { reveal: revealed });

  const copy = () => {
    // Copies the unmasked credential whatever is shown; `render` masks by default.
    void copyWithToast(render(agent, format, { reveal: true }), "Credential copied");
    markAgentCopied(agent.id);
  };

  return (
    <div className="agentcred">
      <div className="agentcred__hdr">
        <div className="agentcred__tabs" role="tablist" aria-label="Credential format">
          {(["json", "env"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={format === f}
              className={`choice${format === f ? " choice--on" : ""}`}
              onClick={() => setFormat(f)}
            >
              {f === "json" ? "JSON" : ".env"}
            </button>
          ))}
        </div>
        {agent.copiedAt === undefined ? null : <span className="badge">copied</span>}
      </div>

      <pre className="agentcred__body">{shown}</pre>

      <div className="agentcred__actions">
        <button type="button" className="btn btn--cta btn--sm" onClick={copy}>
          Copy credential
        </button>
        <button
          type="button"
          className="btn btn--outline btn--sm"
          aria-pressed={revealed}
          onClick={() => setRevealed((r) => !r)}
        >
          {revealed ? "Hide key" : "Reveal key"}
        </button>
      </div>

      <Notice tone="warn" title="This key can spend everything the agent holds" announce={false}>
        Hand it over through a private channel. Anyone who reads it can drain the agent, and it
        cannot be rotated — to cut an agent off, sweep its balance back here.
      </Notice>
    </div>
  );
}
