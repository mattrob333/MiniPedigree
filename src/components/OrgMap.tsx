import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  useReactFlow,
  useViewport,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { PedigreeState, Person, Status } from "@/types";
import { Icon } from "./Icon";
import { OrgNodeCard, type OrgNodeData } from "./OrgNode";
import { layoutTree } from "@/lib/layout";

const nodeTypes = { org: OrgNodeCard };

const DIMS = {
  detailed: { nodeW: 240, nodeH: 172, hGap: 56, vGap: 84 },
  compact: { nodeW: 200, nodeH: 96, hGap: 48, vGap: 80 },
};

const STATUS_COLOR: Record<string, string> = {
  "needs-discovery": "#6e8ea8",
  "needs-review": "#facc15",
  parsed: "#38d5ff",
  mapped: "#6ee7d6",
  ready: "#34d399",
  generated: "#22f3a3",
  blocked: "#f87171",
};

interface OrgMapProps {
  people: Person[];
  pedigree: PedigreeState;
  selectedId: string | null;
  onSelectNode: (id: string) => void;
}

export function OrgMap(props: OrgMapProps) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  );
}

function Flow({ people, pedigree, selectedId, onSelectNode }: OrgMapProps) {
  const rf = useReactFlow();
  const { zoom } = useViewport();
  const [density, setDensity] = useState<"compact" | "detailed">("detailed");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const fitRef = useRef<number | null>(null);

  const dims = DIMS[density];
  const positions = useMemo(() => layoutTree(people, dims), [people, dims]);

  const matchingIds = useMemo(() => {
    if (!searchQ.trim()) return null;
    const q = searchQ.toLowerCase();
    return new Set(
      people
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.title.toLowerCase().includes(q) ||
            p.department.toLowerCase().includes(q),
        )
        .map((p) => p.id),
    );
  }, [searchQ, people]);

  const nodes: Node<OrgNodeData>[] = useMemo(
    () =>
      people.map((p) => ({
        id: p.id,
        type: "org",
        position: positions[p.id] ?? { x: 0, y: 0 },
        data: {
          person: p,
          state: pedigree[p.id],
          selected: selectedId === p.id,
          compact: density === "compact",
          dimmed: !!matchingIds && !matchingIds.has(p.id),
        },
        draggable: false,
        connectable: false,
        width: dims.nodeW,
      })),
    [people, positions, pedigree, selectedId, density, matchingIds, dims.nodeW],
  );

  const edges: Edge[] = useMemo(
    () =>
      people
        .filter((p) => p.managerId && positions[p.managerId])
        .map((p) => {
          const active = selectedId === p.id || selectedId === p.managerId;
          const dim = !!matchingIds && !(matchingIds.has(p.id) && matchingIds.has(p.managerId!));
          return {
            id: `${p.managerId}->${p.id}`,
            source: p.managerId as string,
            target: p.id,
            type: "default",
            className: dim ? "edge-dim" : active ? "edge-active" : "",
          };
        }),
    [people, positions, selectedId, matchingIds],
  );

  // Fit to view whenever the org or density changes.
  useEffect(() => {
    if (fitRef.current) window.clearTimeout(fitRef.current);
    fitRef.current = window.setTimeout(() => {
      rf.fitView({ padding: 0.18, duration: 320, maxZoom: 1.2 });
    }, 60);
    return () => {
      if (fitRef.current) window.clearTimeout(fitRef.current);
    };
  }, [people, density, rf]);

  const centerRoot = () => {
    const root = people.find((p) => !p.managerId);
    if (!root) return;
    const pos = positions[root.id];
    if (pos) rf.setCenter(pos.x + dims.nodeW / 2, pos.y + dims.nodeH / 2, { zoom: 1, duration: 320 });
  };

  const legendCounts = useMemo(() => {
    const c: Record<string, number> = { "needs-discovery": 0, "needs-review": 0, mapped: 0, ready: 0, generated: 0 };
    for (const p of people) {
      const s = (pedigree[p.id]?.status ?? "needs-discovery") as Status;
      if (c[s] != null) c[s]++;
    }
    return c;
  }, [pedigree, people]);

  return (
    <div className="orgmap">
      <div className="rf-host">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, n) => onSelectNode(n.id)}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          fitView
          fitViewOptions={{ padding: 0.18, maxZoom: 1.2 }}
        >
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor={(n) => STATUS_COLOR[((n.data as OrgNodeData)?.state?.status as string) ?? "needs-discovery"] ?? "#6e8ea8"}
            nodeStrokeWidth={2}
            maskColor="rgba(4,8,14,0.45)"
            style={{ width: 180, height: 120 }}
          />
        </ReactFlow>
      </div>

      {/* Control bar */}
      <div className="orgmap-controlbar">
        <div className="orgmap-title">
          <div className="t1">
            <Icon name="network" size={14} stroke="var(--cyan)" />
            Org Map
            <span className="tag" style={{ marginLeft: 6 }}>{people.length} people</span>
          </div>
          <div className="t2">Visual reporting structure from uploaded CSV</div>
        </div>

        <div className="orgmap-controls">
          <div className="view-toggle">
            <button data-active={density === "compact"} onClick={() => setDensity("compact")}>Compact</button>
            <button data-active={density === "detailed"} onClick={() => setDensity("detailed")}>Detailed</button>
          </div>

          <div className="divider" />

          {searchOpen ? (
            <div className="input-with-icon" style={{ width: 200 }}>
              <Icon name="search" size={12} className="icon" />
              <input
                autoFocus
                className="input"
                placeholder="Search people…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchOpen(false);
                    setSearchQ("");
                  }
                }}
              />
            </div>
          ) : (
            <button className="icon-btn" onClick={() => setSearchOpen(true)} title="Search people">
              <Icon name="search" size={13} />
            </button>
          )}

          <button className="icon-btn" onClick={() => rf.fitView({ padding: 0.18, duration: 320, maxZoom: 1.2 })} title="Fit to view">
            <Icon name="fit" size={13} />
          </button>
          <button className="icon-btn" onClick={centerRoot} title="Center root">
            <Icon name="target" size={13} />
          </button>
        </div>
      </div>

      {/* Zoom controls (bottom-left) */}
      <div className="zoom-controls">
        <button onClick={() => rf.zoomIn({ duration: 160 })} title="Zoom in"><Icon name="plus" size={12} /></button>
        <div className="zoom-level">{Math.round(zoom * 100)}%</div>
        <button onClick={() => rf.zoomOut({ duration: 160 })} title="Zoom out"><Icon name="minus" size={12} /></button>
        <button onClick={() => rf.fitView({ padding: 0.18, duration: 320, maxZoom: 1.2 })} title="Fit"><Icon name="fit" size={12} /></button>
      </div>

      {/* Legend (bottom-right, above minimap) */}
      <div className="legend" style={{ position: "absolute", right: 14, bottom: 142, zIndex: 10 }}>
        <div className="lh">
          <span>Status</span>
          <span style={{ color: "var(--text-5)" }}>{people.length} people</span>
        </div>
        <div className="row"><span className="swatch" style={{ background: "#6e8ea8" }} /> <span style={{ flex: 1 }}>Needs discovery</span><span className="mono dim">{legendCounts["needs-discovery"]}</span></div>
        <div className="row"><span className="swatch" style={{ background: "var(--yellow)" }} /> <span style={{ flex: 1 }}>Needs review</span><span className="mono dim">{legendCounts["needs-review"]}</span></div>
        <div className="row"><span className="swatch" style={{ background: "#6ee7d6" }} /> <span style={{ flex: 1 }}>Responsibilities mapped</span><span className="mono dim">{legendCounts["mapped"]}</span></div>
        <div className="row"><span className="swatch" style={{ background: "var(--green)" }} /> <span style={{ flex: 1 }}>Ready for agent</span><span className="mono dim">{legendCounts["ready"]}</span></div>
        <div className="row"><span className="swatch" style={{ background: "var(--green-bright)" }} /> <span style={{ flex: 1 }}>Agent generated</span><span className="mono dim">{legendCounts["generated"]}</span></div>
      </div>
    </div>
  );
}
