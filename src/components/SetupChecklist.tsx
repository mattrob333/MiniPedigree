import { Icon } from "./Icon";
import type { ChecklistItem, CompanyStage } from "@/lib/maturity";

// ── UX reset: persistent setup checklist ───────────────────────────────
// The product guides the user, not a slideshow. The checklist lives in the
// workspace header until setup completes; each step routes to its real
// surface. States: done / current / locked.

interface Props {
  items: ChecklistItem[];
  onNavigate: (stage: CompanyStage) => void;
}

export function SetupChecklist({ items, onNavigate }: Props) {
  return (
    <div className="setup-checklist" role="navigation" aria-label="Setup progress">
      {items.map((item, i) => (
        <button
          key={item.id}
          className={`setup-step ${item.state}`}
          disabled={item.state === "locked"}
          onClick={() => onNavigate(item.id)}
          title={item.state === "locked" ? "Complete the earlier steps first" : undefined}
        >
          <span className="setup-step-marker">
            {item.state === "done" ? <Icon name="checkmark" size={10} /> : i + 1}
          </span>
          <span className="setup-step-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
