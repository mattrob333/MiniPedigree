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
import type { PedigreeState, Person, RecommendedSession, Status } from "@/types";
import { Icon } from "./Icon";
import { OrgNodeCard, type OrgNodeData } from "./OrgNode";
import { layoutTree } from "@/lib/layout";
import { getDepartmentColor } from "@/lib/departments";
import { directReports, teamMapped, recommendSessionType, SESSION_LABEL, isMapped } from "@/lib/sessions";

const nodeTypes = { org: OrgNodeCard };

const DIMS = {
  detailed: { nodeW: 240, nodeH: 156, hGap: 56, vGap: 88 },
  compact: { nodeW: 200, nodeH: 96, hGap: 48, vGap: 80 },
};

const STATUS_COLOR: Record<string, string> = {
  "needs-discovery": "#6e8ea8",
  "session-scheduled": "#facc15",
  "session-captured": "#38d5ff",
  "needs-review": "#facc15",
  parsed: "#38d5ff",
  mapped: "#6ee7d6",
  ready: "#34d399",
  generated: "#22f3a3",
  blocked: "#f87171",
};

type StatusFilter = "all" | "unmapped" | "ready";

interface OrgMapProps {
  people: Person[];
  pedigree: PedigreeState;
  selectedId: string | null;
  onSelectNode: (id: string) => void;
  recommended: RecommendedSession[];
  onStartSession: (personId: string) => void;
}

export function OrgMap(props: OrgMapProps) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  );
}

function Flow({ people, pedigree, selectedId, onSelectNode, recommended, onStartSession }: OrgMapProps) {
  const rf = useReactFlow();
  const { zoom } = useViewport();
  const [density, setDensity] = useState<"compact" | "detailed">(people.length > 45 ? "compact" : "detailed");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [legendMode, setLegendMode] = useState<"dept" | "status">("dept");
  const [showRecommended, setShowRecommended] = useState(true);
  const fitRef = useRef<number | null>(null);

  const dims = DIMS[density];
  const positions = useMemo(() => layoutTree(people, dims), [people, dims]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const departments = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of people) m.set(p.department || "—", (m.get(p.department || "—") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [people]);

  const deptMapped = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of people) {
      if (isMapped(pedigree[p.id]?.status)) m.set(p.department || "—", (m.get(p.department || "—") ?? 0) + 1);
    }
    return m;
  }, [people, pedigree]);

  // search matches
  const matchingIds = useMemo(() => {
    if (!searchQ.trim()) return null;
    const q = searchQ.toLowerCase();
    return new Set(
      people
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.title.toLowerCase().includes(q) ||
            p.department.toLowerCase().includes(q) ||
            p.email.toLowerCase().includes(q) ||
            p.tools.join(" ").toLowerCase().includes(q),
        )
        .map((p) => p.id),
    );
  }, [searchQ, people]);

  // ancestors helper (keep parent chain visible during department focus)
  const ancestorsOf = (id: string): string[] => {
    const out: string[] = [];
    let cur = byId.get(id)?.managerId ?? null;
    const guard = new Set<string>();
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      out.push(cur);
      cur = byId.get(cur)?.managerId ?? null;
    }
    return out;
  };

  // department-focus visible set (dept nodes + their ancestors)
  const deptVisible = useMemo(() => {
    if (deptFilter === "all") return null;
    const vis = new Set<string>();
    for (const p of people) {
      if ((p.department || "—") === deptFilter) {
        vis.add(p.id);
        for (const a of ancestorsOf(p.id)) vis.add(a);
      }
    }
    return vis;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptFilter, people]);

  const statusVisible = useMemo(() => {
    if (statusFilter === "all") return null;
    const vis = new Set<string>();
    for (const p of people) {
      const s = pedigree[p.id]?.status ?? "needs-discovery";
      const ok = statusFilter === "unmapped" ? !isMapped(s) : s === "ready" || s === "generated";
      if (ok) vis.add(p.id);
    }
    return vis;
  }, [statusFilter, people, pedigree]);

  // session scope (selected + its direct reports) for highlight
  const scopeIds = useMemo(() => {
    if (!selectedId) return null;
    const reports = directReports(selectedId, people).map((r) => r.id);
    return new Set<string>([selectedId, ...reports]);
  }, [selectedId, people]);

  const isDimmed = (id: string): boolean => {
    if (matchingIds) return !matchingIds.has(id);
    if (deptVisible) return !deptVisible.has(id);
    if (statusVisible) return !statusVisible.has(id);
    return false;
  };

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
          inScope: !!scopeIds && scopeIds.has(p.id) && selectedId !== p.id,
          compact: density === "compact",
          dimmed: isDimmed(p.id),
          team: teamMapped(p.id, people, pedigree),
        },
        draggable: false,
        connectable: false,
        width: dims.nodeW,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, positions, pedigree, selectedId, density, matchingIds, deptVisible, statusVisible, scopeIds, dims.nodeW],
  );

  const edges: Edge[] = useMemo(
    () =>
      people
        .filter((p) => p.managerId && positions[p.managerId])
        .map((p) => {
          const scopeEdge = !!scopeIds && scopeIds.has(p.id) && scopeIds.has(p.managerId!);
          const dim = isDimmed(p.id) || isDimmed(p.managerId!);
          return {
            id: `${p.managerId}->${p.id}`,
            source: p.managerId as string,
            target: p.id,
            type: "default",
            className: dim ? "edge-dim" : scopeEdge ? "edge-active" : "",
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, positions, scopeIds, matchingIds, deptVisible, statusVisible],
  );

  useEffect(() => {
    if (fitRef.current) window.clearTimeout(fitRef.current);
    fitRef.current = window.setTimeout(() => {
      rf.fitView({ padding: 0.18, duration: 320, maxZoom: 1.2 });
    }, 60);
    return () => {
      if (fitRef.current) window.clearTimeout(fitRef.current);
    };
  }, [people, density, rf]);

  // center on single search match
  useEffect(() => {
    if (matchingIds && matchingIds.size === 1) {
      const id = [...matchingIds][0];
      const pos = positions[id];
      if (pos) rf.setCenter(pos.x + dims.nodeW / 2, pos.y + dims.nodeH / 2, { zoom: 1.1, duration: 320 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchingIds]);

  const centerRoot = () => {
    const root = people.find((p) => !p.managerId);
    if (!root) return;
    const pos = positions[root.id];
    if (pos) rf.setCenter(pos.x + dims.nodeW / 2, pos.y + dims.nodeH / 2, { zoom: 1, duration: 320 });
  };

  const legendCounts = useMemo(() => {
    const c: Record<string, number> = { "needs-discovery": 0, "needs-review": 0, mapped: 0, ready: 0, generated: 0, blocked: 0 };
    for (const p of people) {
      const s = (pedigree[p.id]?.status ?? "needs-discovery") as Status;
      const key = s === "session-scheduled" || s === "session-captured" ? "needs-review" : s;
      if (c[key] != null) c[key]++;
    }
    return c;
  }, [pedigree, people]);

  const selectedPerson = selectedId ? byId.get(selectedId) : undefined;
  const selReports = selectedId ? directReports(selectedId, people) : [];
  const sessionType = selectedPerson ? recommendSessionType(selectedPerson, people, pedigree) : null;

  const focusDeptColor = deptFilter !== "all" ? getDepartmentColor(deptFilter) : null;
  const focusDeptStats = deptFilter !== "all"
    ? { total: departments.find(([d]) => d === deptFilter)?.[1] ?? 0, mapped: deptMapped.get(deptFilter) ?? 0 }
    : null;

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
          <div className="t2">Walk the org top-down · map responsibilities layer by layer</div>
        </div>

        <div className="orgmap-controls" style={{ flexWrap: "wrap", maxWidth: "70%", justifyContent: "flex-end" }}>
          <select className="orgmap-select" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} title="Department focus">
            <option value="all">All Departments</option>
            {departments.map(([d]) => <option key={d} value={d}>{d}</option>)}
          </select>

          <select className="orgmap-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} title="Status filter">
            <option value="all">All Statuses</option>
            <option value="unmapped">Show Unmapped</option>
            <option value="ready">Show Ready for Agent</option>
          </select>

          <div className="view-toggle">
            <button data-active={density === "compact"} onClick={() => setDensity("compact")}>Compact</button>
            <button data-active={density === "detailed"} onClick={() => setDensity("detailed")}>Detailed</button>
          </div>

          {searchOpen ? (
            <div className="input-with-icon" style={{ width: 180 }}>
              <Icon name="search" size={12} className="icon" />
              <input
                autoFocus
                className="input"
                placeholder="Search people…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { setSearchOpen(false); setSearchQ(""); } }}
              />
            </div>
          ) : (
            <button className="icon-btn" onClick={() => setSearchOpen(true)} title="Search people"><Icon name="search" size={13} /></button>
          )}

          <button className="icon-btn" onClick={() => rf.fitView({ padding: 0.18, duration: 320, maxZoom: 1.2 })} title="Fit to view"><Icon name="fit" size={13} /></button>
          <button className="icon-btn" onClick={centerRoot} title="Center root"><Icon name="target" size={13} /></button>

          {/* Contextual (selected node) — distinct from the global header CTA */}
          {selectedPerson && (
            <button className="btn btn-sm btn-primary" onClick={() => onStartSession(selectedPerson.id)} title="Run discovery for the selected person">
              <Icon name="sparkles" size={12} /> {isMapped(pedigree[selectedPerson.id]?.status) ? "Update" : "Map"} {selectedPerson.name.split(/\s+/)[0]}
            </button>
          )}
        </div>
      </div>

      {/* Department focus banner */}
      {focusDeptStats && focusDeptColor && (
        <div className="focus-banner" style={{ borderColor: focusDeptColor.border }}>
          <span className="dept-dot" style={{ width: 9, height: 9, borderRadius: "50%", background: focusDeptColor.accent }} />
          <span>Department Focus: <strong>{deptFilter}</strong></span>
          <span className="meta">{focusDeptStats.total} people · {focusDeptStats.mapped} mapped</span>
          <button className="btn btn-sm btn-ghost" onClick={() => setDeptFilter("all")}>Clear Focus</button>
        </div>
      )}

      {/* Selection scope banner */}
      {selectedPerson && !focusDeptStats && selReports.length > 0 && sessionType && (
        <div className="focus-banner">
          <Icon name="target" size={13} stroke="var(--cyan)" />
          <span>Mapping Scope: <strong>{selectedPerson.name}</strong> + {selReports.length} direct reports</span>
          <button className="btn btn-sm btn-primary" onClick={() => onStartSession(selectedPerson.id)}>
            {isMapped(pedigree[selectedPerson.id]?.status) ? "Update" : "Start"} {SESSION_LABEL[sessionType]}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => onSelectNode(selectedPerson.id)}>Clear</button>
        </div>
      )}

      {/* Next Recommended Sessions */}
      {recommended.length > 0 && (
        showRecommended ? (
          <div className="next-sessions">
            <div className="ns-head">
              <Icon name="sparkles" size={13} stroke="var(--cyan)" /> Next Recommended Sessions
              <span className="count">{recommended.length}</span>
              <button className="x icon-btn" style={{ width: 22, height: 22, border: 0, background: "transparent" }} onClick={() => setShowRecommended(false)} title="Collapse"><Icon name="close" size={12} /></button>
            </div>
            <div className="ns-body">
              {recommended.map((r) => {
                const p = byId.get(r.personId);
                if (!p) return null;
                const dc = getDepartmentColor(p.department);
                return (
                  <div key={r.personId} className="ns-card" style={{ borderLeftColor: dc.accent }}>
                    <div className="nm">{p.name}</div>
                    <div className="ti">{p.title} · <span style={{ color: dc.accent }}>{p.department}</span></div>
                    <div className="rsn">{r.reason}</div>
                    <button className="btn btn-sm btn-outline-cyan" onClick={() => onStartSession(r.personId)}>
                      <Icon name="sparkles" size={11} /> Start {SESSION_LABEL[r.type]}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <button className="ns-fab" onClick={() => setShowRecommended(true)}>
            <Icon name="sparkles" size={12} /> Next Sessions <span className="count">{recommended.length}</span>
          </button>
        )
      )}

      {/* zoom controls */}
      <div className="zoom-controls">
        <button onClick={() => rf.zoomIn({ duration: 160 })} title="Zoom in"><Icon name="plus" size={12} /></button>
        <div className="zoom-level">{Math.round(zoom * 100)}%</div>
        <button onClick={() => rf.zoomOut({ duration: 160 })} title="Zoom out"><Icon name="minus" size={12} /></button>
        <button onClick={() => rf.fitView({ padding: 0.18, duration: 320, maxZoom: 1.2 })} title="Fit"><Icon name="fit" size={12} /></button>
      </div>

      {/* Legend (dept / status toggle), above minimap */}
      <div className="dept-legend" style={{ position: "absolute", right: 14, bottom: 142, zIndex: 10 }}>
        <div className="lh">
          <span>{legendMode === "dept" ? "Departments" : "Status"}</span>
          <span className="view-toggle" style={{ transform: "scale(0.9)" }}>
            <button data-active={legendMode === "dept"} onClick={() => setLegendMode("dept")}>Dept</button>
            <button data-active={legendMode === "status"} onClick={() => setLegendMode("status")}>Status</button>
          </span>
        </div>
        {legendMode === "dept" ? (
          departments.slice(0, 8).map(([d, n]) => {
            const dc = getDepartmentColor(d);
            const mapped = deptMapped.get(d) ?? 0;
            return (
              <div key={d} className="row" data-active={deptFilter === d} onClick={() => setDeptFilter(deptFilter === d ? "all" : d)}>
                <span className="swatch" style={{ background: dc.accent }} />
                <span className="nm">{d}</span>
                <span className="ct">{mapped}/{n}</span>
              </div>
            );
          })
        ) : (
          <>
            <div className="row"><span className="swatch" style={{ background: "#6e8ea8" }} /><span className="nm">Needs discovery</span><span className="ct">{legendCounts["needs-discovery"]}</span></div>
            <div className="row"><span className="swatch" style={{ background: "var(--yellow)" }} /><span className="nm">Needs review</span><span className="ct">{legendCounts["needs-review"]}</span></div>
            <div className="row"><span className="swatch" style={{ background: "#6ee7d6" }} /><span className="nm">Responsibilities mapped</span><span className="ct">{legendCounts["mapped"]}</span></div>
            <div className="row"><span className="swatch" style={{ background: "var(--green)" }} /><span className="nm">Ready for agent</span><span className="ct">{legendCounts["ready"]}</span></div>
            <div className="row"><span className="swatch" style={{ background: "var(--green-bright)" }} /><span className="nm">Agent generated</span><span className="ct">{legendCounts["generated"]}</span></div>
            <div className="row"><span className="swatch" style={{ background: "var(--red)" }} /><span className="nm">Needs clarification</span><span className="ct">{legendCounts["blocked"]}</span></div>
          </>
        )}
      </div>
    </div>
  );
}
