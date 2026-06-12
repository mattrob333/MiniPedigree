import { useMemo } from "react";
import { ReactFlow, ReactFlowProvider, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { PedigreeState, Person } from "@/types";
import { OrgNodeCard, type OrgNodeData } from "./OrgNode";
import { layoutTree } from "@/lib/layout";
import { teamMapped } from "@/lib/sessions";

const nodeTypes = { org: OrgNodeCard };
const DIMS = { nodeW: 200, nodeH: 96, hGap: 48, vGap: 80 };

interface OrgMapMiniProps {
  people: Person[];
  pedigree: PedigreeState;
  highlightIds?: string[];
  dimOthers?: boolean;
  height?: number;
  onSelectNode?: (id: string) => void;
}

export function OrgMapMini({ people, pedigree, highlightIds = [], dimOthers = false, height = 280, onSelectNode }: OrgMapMiniProps) {
  const positions = useMemo(() => layoutTree(people, DIMS), [people]);
  const highlight = useMemo(() => new Set(highlightIds), [highlightIds]);
  const dim = (id: string) => dimOthers && highlight.size > 0 && !highlight.has(id);

  const nodes: Node<OrgNodeData>[] = useMemo(
    () =>
      people.map((p) => ({
        id: p.id,
        type: "org",
        position: positions[p.id] ?? { x: 0, y: 0 },
        data: {
          person: p,
          state: pedigree[p.id],
          selected: false,
          inScope: highlight.has(p.id),
          compact: true,
          dimmed: dim(p.id),
          team: teamMapped(p.id, people, pedigree),
        },
        draggable: false,
        connectable: false,
        width: DIMS.nodeW,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, positions, pedigree, highlight, dimOthers],
  );

  const edges: Edge[] = useMemo(
    () =>
      people
        .filter((p) => p.managerId && positions[p.managerId])
        .map((p) => ({
          id: `${p.managerId}->${p.id}`,
          source: p.managerId as string,
          target: p.id,
          type: "default",
          className: dim(p.id) || dim(p.managerId!) ? "edge-dim"
            : highlight.has(p.id) && highlight.has(p.managerId!) ? "edge-active" : "",
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, positions, highlight, dimOthers],
  );

  return (
    <div className="orgmap-mini" style={{ height }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onSelectNode ? (_, n) => onSelectNode(n.id) : undefined}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          panOnDrag={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        />
      </ReactFlowProvider>
    </div>
  );
}
