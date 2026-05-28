import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { PedigreeRow, Person, Status } from "@/types";
import { initials, STATUS_LABEL } from "@/lib/util";

export interface OrgNodeData {
  person: Person;
  state: PedigreeRow | undefined;
  selected: boolean;
  compact: boolean;
  dimmed: boolean;
  [key: string]: unknown;
}

export function OrgNodeCard({ data }: NodeProps) {
  const { person, state, selected, compact, dimmed } = data as OrgNodeData;
  const statusKey: Status = state?.status ?? "needs-discovery";
  const respCount = state?.responsibilities?.length ?? 0;
  const delegCount = state?.tasks?.delegatable?.length ?? 0;
  const agentCount = state?.agents?.length ?? 0;
  const isRoot = !person.managerId;

  return (
    <div
      className={
        "org-node" +
        (selected ? " selected" : "") +
        (isRoot ? " role-root" : "") +
        (compact ? " compact" : "")
      }
      data-status={statusKey}
      style={{ opacity: dimmed ? 0.28 : 1, transition: "opacity 120ms" }}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <div className="accent" />
      <div className="org-node-body">
        <div className="org-node-head">
          <div className="avatar">{initials(person.name)}</div>
          <div className="who">
            <div className="name">{person.name}</div>
            <div className="title">{person.title}</div>
            {!compact && <div className="dept">{person.department}</div>}
          </div>
        </div>
        {!compact && (
          <div className="org-node-stats">
            <div className="org-node-stat">
              <div className={"v " + (respCount ? "" : "dim")}>{respCount}</div>
              <div className="l">Resps</div>
            </div>
            <div className="org-node-stat">
              <div className={"v " + (delegCount ? "cy" : "dim")}>{delegCount}</div>
              <div className="l">Deleg</div>
            </div>
            <div className="org-node-stat">
              <div className={"v " + (agentCount ? "gr" : "dim")}>{agentCount}</div>
              <div className="l">Agents</div>
            </div>
          </div>
        )}
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
