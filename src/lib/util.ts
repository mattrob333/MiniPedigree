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

export const STATUS_LABEL: Record<Status, string> = {
  "needs-discovery": "Needs discovery",
  "session-scheduled": "Session scheduled",
  "session-captured": "Session captured",
  "needs-review": "Needs review",
  parsed: "Parsed",
  mapped: "Responsibilities mapped",
  ready: "Ready for agent",
  generated: "Agent generated",
  blocked: "Needs clarification",
};

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
