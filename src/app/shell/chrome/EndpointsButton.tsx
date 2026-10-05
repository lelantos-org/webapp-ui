import { overriddenEndpoints } from "@/config/env";
import { openEndpointsDialog } from "@/shared/hooks/use-endpoints-dialog";
import { GearGlyph } from "@/shared/ui/icons/glyphs";
import "./header-button.css";

/// Opens the endpoint settings. Marked while any service is one the user chose.
export function EndpointsButton() {
  const custom = overriddenEndpoints().length > 0;
  const label = custom ? "network endpoints (custom in use)" : "network endpoints";
  return (
    <button
      type="button"
      className="hdr-btn"
      data-marked={custom || undefined}
      onClick={openEndpointsDialog}
      title={label}
      aria-label={label}
    >
      <GearGlyph size={15} />
    </button>
  );
}
