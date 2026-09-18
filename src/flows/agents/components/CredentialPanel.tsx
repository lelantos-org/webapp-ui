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

/// The credential, in the two shapes an agent process consumes.
///
/// Copy, never download: a spending key in the downloads folder is one nobody
/// remembers deleting. The key stays masked until asked for — handing it over
/// does not require reading it, and this panel appears the moment an agent is
/// funded, which is exactly when someone may be watching the screen.
export function CredentialPanel({ agent }: { agent: StoredAgent }) {
  const [format, setFormat] = useState<CredentialFormat>("json");
  const [revealed, setRevealed] = useState(false);
  const shown = render(agent, format, { reveal: revealed });

  const copy = () => {
    // Always the real credential, whatever is on screen. `render` masks by
    // default, so the copy path has to ask for the key explicitly.
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
              className={`agentcred__tab${format === f ? " agentcred__tab--on" : ""}`}
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
