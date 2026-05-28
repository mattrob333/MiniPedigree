import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { PedigreeRow, Person, Status } from "@/types";
import { initials, STATUS_LABEL } from "@/lib/util";
import { getDepartmentColor } from "@/lib/departments";

export interface OrgNodeData {
  person: Person;
  state: PedigreeRow | undefined;
  selected: boolean;
  inScope: boolean; // part of the active mapping-session scope (soft highlight)
  compact: boolean;
  dimmed: boolean;
  team: { mapped: number; total: number } | null;
  [key: string]: unknown;
}

const STATUS_RING: Partial<Record<Status, string>> = {
  "needs-review": "0 0 0 1.5px var(--yellow)",
  "session-scheduled": "0 0 0 1.5px var(--yellow)",
  "session-captured": "0 0 0 1.5px var(--cyan)",
  mapped: "0 0 0 1.5px #6ee7d6",
  ready: "0 0 0 1.5px var(--green), 0 0 16px -6px rgba(52,211,153,0.6)",
  generated: "0 0 0 1.5px var(--green-bright), 0 0 18px -6px rgba(34,243,163,0.7)",
  blocked: "0 0 0 1.5px var(--red)",
};

export function OrgNodeCard({ data }: NodeProps) {
  const { person, state, selected, inScope, compact, dimmed, team } = data as OrgNodeData;
  const statusKey: Status = state?.status ?? "needs-discovery";
  const respCount = state?.responsibilities?.length ?? 0;
  const delegCount = state?.tasks?.delegatable?.length ?? 0;
  const agentCount = state?.agents?.length ?? 0;
  const dept = getDepartmentColor(person.department);

  const baseShadow = "0 12px 30px -16px rgba(0,0,0,0.35)";
  const ring = selected
    ? "0 0 0 2px var(--cyan), 0 0 24px -6px rgba(56,213,255,0.55)"
    : inScope
      ? "0 0 0 1.5px rgba(56,213,255,0.6)"
      : STATUS_RING[statusKey] ?? "none";
  const boxShadow = ring === "none" ? baseShadow : `${ring}, ${baseShadow}`;

  return (
    <div
      className={"org-node" + (compact ? " compact" : "")}
      data-status={statusKey}
      style={{ opacity: dimmed ? 0.28 : 1, transition: "opacity 140ms", borderColor: dept.border, boxShadow }}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <div className="accent" style={{ background: dept.accent, opacity: 0.9 }} />
      <div className="org-node-body">
        <div className="org-node-head">
          <div className="avatar" style={{ borderColor: dept.border }}>{initials(person.name)}</div>
          <div className="who">
            <div className="name">{person.name}</div>
            <div className="title">{person.title}</div>
          </div>
        </div>

        {!compact && (
          <div className="org-node-dept">
            <span className="dept-dot" style={{ background: dept.accent }} />
            <span className="dept-pill" style={{ color: dept.accent, background: dept.bg, borderColor: dept.border }}>
              {person.department}
            </span>
          </div>
        )}

        <div className="org-node-metrics">
          <span className="m"><b className={respCount ? "" : "dim"}>R</b> {respCount}</span>
          <span className="m"><b className={delegCount ? "cy" : "dim"}>T</b> {delegCount}</span>
          <span className="m"><b className={agentCount ? "gr" : "dim"}>A</b> {agentCount}</span>
          {!compact && team && team.total > 0 && (
            <span className="m team">Team {team.mapped}/{team.total}</span>
          )}
        </div>
      </div>
      <div className="org-node-foot">
        <span className={"badge " + statusKey}>
          <span className="dot" />
          {STATUS_LABEL[statusKey]}
        </span>
        <span className="person-id">{person.id}</span>
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}
