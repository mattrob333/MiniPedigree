import type { Person } from "@/types";

export interface Pos {
  x: number;
  y: number;
}

export interface LayoutOpts {
  nodeW: number;
  nodeH: number;
  hGap: number;
  vGap: number;
}

/**
 * Recursive tidy-tree layout: computes subtree widths, then centers each parent
 * over its children. Handles arbitrary depth, fan-out, and multiple roots.
 */
export function layoutTree(people: Person[], opts: LayoutOpts): Record<string, Pos> {
  const { nodeW, nodeH, hGap, vGap } = opts;

  const childrenOf: Record<string, Person[]> = {};
  const byId = new Map(people.map((p) => [p.id, p]));
  for (const p of people) {
    const k = p.managerId && byId.has(p.managerId) ? p.managerId : "__root__";
    (childrenOf[k] = childrenOf[k] || []).push(p);
  }
  const roots = childrenOf["__root__"] || [];

  const positions: Record<string, Pos> = {};
  const widthCache = new Map<string, number>();

  const subtreeWidth = (id: string): number => {
    if (widthCache.has(id)) return widthCache.get(id)!;
    const kids = childrenOf[id] || [];
    let w: number;
    if (kids.length === 0) {
      w = nodeW;
    } else {
      w = kids.reduce((s, k, i) => s + subtreeWidth(k.id) + (i ? hGap : 0), 0);
      w = Math.max(w, nodeW);
    }
    widthCache.set(id, w);
    return w;
  };

  const place = (node: Person, leftX: number, topY: number) => {
    const myW = subtreeWidth(node.id);
    positions[node.id] = { x: leftX + (myW - nodeW) / 2, y: topY };
    const kids = childrenOf[node.id] || [];
    let cursor = leftX;
    const childTop = topY + vGap + nodeH;
    for (const k of kids) {
      const kw = subtreeWidth(k.id);
      place(k, cursor, childTop);
      cursor += kw + hGap;
    }
  };

  let cursor = 0;
  for (const r of roots) {
    place(r, cursor, 0);
    cursor += subtreeWidth(r.id) + hGap * 2;
  }

  // Any orphan (cycle remnant) without a position lands in a trailing row.
  let orphanX = 0;
  for (const p of people) {
    if (!positions[p.id]) {
      positions[p.id] = { x: orphanX, y: -(vGap + nodeH) };
      orphanX += nodeW + hGap;
    }
  }

  return positions;
}
