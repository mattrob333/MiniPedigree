import type { Person, SessionBrief } from "@/types";

export function briefToParticipantMarkdown(brief: SessionBrief, participants: Person[], forPersonId?: string, scheduledLabel?: string): string {
  const names = new Map(participants.map((p) => [p.id, p.name]));
  const visibleQuestions = brief.questions
    .filter((q) => q.text.trim())
    .filter((q) => !forPersonId || q.target_person_id === "group" || q.target_person_id === forPersonId)
    .sort((a, b) => a.order - b.order);
  const systems = [...new Set(brief.probe_areas.map((p) => p.system.trim()).filter(Boolean))];
  const title = `# Prep: ${brief.session_id}${scheduledLabel ? ` - ${scheduledLabel}` : ""}`;

  const lines = [
    title,
    "",
    "## What this session is for",
    brief.objectives.trim(),
    "",
    "## Come ready to discuss",
    ...visibleQuestions.map((q) => `- ${questionText(q.text, q.target_person_id, names)}`),
  ];

  if (systems.length) {
    lines.push("", "## Systems you may be asked to walk through", ...systems.map((system) => `- ${system}`));
  }

  lines.push("", "Takes 30 seconds to skim - no prep documents needed, just be ready to talk through your real recent work.");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function questionText(text: string, targetPersonId: string, names: Map<string, string>) {
  const clean = text.trim();
  if (targetPersonId === "group") return clean;
  const name = names.get(targetPersonId);
  const first = name ? firstName(name) : "";
  return first ? `${first}: ${clean.replace(new RegExp(`^${escapeRegExp(first)},\\s*`, "i"), "")}` : clean;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
