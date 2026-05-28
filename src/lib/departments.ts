export interface DeptColor {
  accent: string;
  border: string;
  bg: string;
}

// Curated, dark-mode-friendly palette (no purple). Keys are canonical departments.
export const DEPARTMENT_COLORS: Record<string, DeptColor> = {
  Executive: { accent: "#38d5ff", border: "rgba(56,213,255,0.75)", bg: "rgba(56,213,255,0.08)" },
  "Clinical Operations": { accent: "#14b8a6", border: "rgba(20,184,166,0.75)", bg: "rgba(20,184,166,0.08)" },
  Clinical: { accent: "#2dd4bf", border: "rgba(45,212,191,0.75)", bg: "rgba(45,212,191,0.08)" },
  "Revenue Cycle": { accent: "#22c55e", border: "rgba(34,197,94,0.75)", bg: "rgba(34,197,94,0.08)" },
  Technology: { accent: "#3b82f6", border: "rgba(59,130,246,0.75)", bg: "rgba(59,130,246,0.08)" },
  "People Operations": { accent: "#f59e0b", border: "rgba(245,158,11,0.75)", bg: "rgba(245,158,11,0.08)" },
  Compliance: { accent: "#f97316", border: "rgba(249,115,22,0.75)", bg: "rgba(249,115,22,0.08)" },
  Finance: { accent: "#84cc16", border: "rgba(132,204,22,0.75)", bg: "rgba(132,204,22,0.08)" },
  Operations: { accent: "#06b6d4", border: "rgba(6,182,212,0.75)", bg: "rgba(6,182,212,0.08)" },
  Sales: { accent: "#0ea5e9", border: "rgba(14,165,233,0.75)", bg: "rgba(14,165,233,0.08)" },
  Marketing: { accent: "#eab308", border: "rgba(234,179,8,0.65)", bg: "rgba(234,179,8,0.06)" },
  Default: { accent: "#94a3b8", border: "rgba(148,163,184,0.55)", bg: "rgba(148,163,184,0.06)" },
};

// Keyword → canonical department, so real-world labels map onto the curated colors.
const KEYWORD_MAP: [RegExp, string][] = [
  [/exec|leadership|ceo|c-suite|board/i, "Executive"],
  [/clinic op|clinical op|patient access|nursing/i, "Clinical Operations"],
  [/clinic|clinical|medical|provider|care|nurse|physician/i, "Clinical"],
  [/revenue cycle|billing|claims|collections|denials/i, "Revenue Cycle"],
  [/tech|engineering|\bit\b|information|software|data|platform|infra|systems/i, "Technology"],
  [/security|infosec|cyber/i, "Compliance"],
  [/people|talent|hr\b|human resources|recruit/i, "People Operations"],
  [/complian|quality|audit|risk|regulatory|legal/i, "Compliance"],
  [/finance|accounting|controller|treasury|fp&a/i, "Finance"],
  [/revenue ops|rev ?ops|sales op/i, "Operations"],
  [/operations|ops|facilities|logistics|supply/i, "Operations"],
  [/sales|account exec|business development|channel|partner/i, "Sales"],
  [/marketing|growth|demand|content|brand/i, "Marketing"],
];

// Safe palette for unknown departments (deterministic by name hash, no purple/pink).
const SAFE_DEPARTMENT_PALETTE: DeptColor[] = [
  { accent: "#14b8a6", border: "rgba(20,184,166,0.7)", bg: "rgba(20,184,166,0.07)" },
  { accent: "#3b82f6", border: "rgba(59,130,246,0.7)", bg: "rgba(59,130,246,0.07)" },
  { accent: "#22c55e", border: "rgba(34,197,94,0.7)", bg: "rgba(34,197,94,0.07)" },
  { accent: "#f59e0b", border: "rgba(245,158,11,0.7)", bg: "rgba(245,158,11,0.07)" },
  { accent: "#06b6d4", border: "rgba(6,182,212,0.7)", bg: "rgba(6,182,212,0.07)" },
  { accent: "#84cc16", border: "rgba(132,204,22,0.7)", bg: "rgba(132,204,22,0.07)" },
  { accent: "#f97316", border: "rgba(249,115,22,0.7)", bg: "rgba(249,115,22,0.07)" },
  { accent: "#0ea5e9", border: "rgba(14,165,233,0.7)", bg: "rgba(14,165,233,0.07)" },
  { accent: "#eab308", border: "rgba(234,179,8,0.65)", bg: "rgba(234,179,8,0.06)" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

const cache = new Map<string, DeptColor>();

export function getDepartmentColor(department?: string | null): DeptColor {
  const key = (department || "").trim();
  if (!key) return DEPARTMENT_COLORS.Default;
  if (cache.has(key)) return cache.get(key)!;

  let color: DeptColor;
  if (DEPARTMENT_COLORS[key]) {
    color = DEPARTMENT_COLORS[key];
  } else {
    const matched = KEYWORD_MAP.find(([re]) => re.test(key));
    if (matched && DEPARTMENT_COLORS[matched[1]]) {
      color = DEPARTMENT_COLORS[matched[1]];
    } else {
      color = SAFE_DEPARTMENT_PALETTE[hashString(key) % SAFE_DEPARTMENT_PALETTE.length];
    }
  }
  cache.set(key, color);
  return color;
}
