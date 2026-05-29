import type { Status } from "@/types";

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Single ordered status state machine (P0.5):
//   Uploaded → Needs Discovery → Mapped → Agent Ready → Agent Generated
// (needs-review is an in-band "Mapped, flagged" sub-state; blocked = "Needs clarification".)
export const STATUS_LABEL: Record<Status, string> = {
  "needs-discovery": "Needs Discovery",
  "session-scheduled": "Needs Discovery",
  "session-captured": "Needs Discovery",
  "needs-review": "Needs Review",
  parsed: "Mapped",
  mapped: "Mapped",
  ready: "Agent Ready",
  generated: "Agent Generated",
  blocked: "Needs Clarification",
};

// The canonical funnel order, used for any ordering/sorting of statuses.
export const STATUS_ORDER: Status[] = [
  "needs-discovery",
  "needs-review",
  "mapped",
  "ready",
  "generated",
];

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}
