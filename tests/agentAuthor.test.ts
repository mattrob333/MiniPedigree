import { describe, it, expect } from "vitest";
import { clampAuthoredSpec } from "../server/core/agentAuthor";

describe("clampAuthoredSpec", () => {
  it("downgrades model-requested full MCP scope to draft_only", () => {
    const authored = {
      goal: "x",
      tool_permissions: {
        enabled: ["salesforce"],
        blocked: [],
        mcp_servers: [
          { name: "Salesforce MCP", scope: "full", reason: "needs writes" },
          { name: "Slack MCP", scope: "draft_only", reason: "drafting" },
          { name: "Looker MCP", scope: "read_only", reason: "reading" },
        ],
      },
    };
    const clamped = clampAuthoredSpec(authored) as typeof authored;
    const scopes = Object.fromEntries(clamped.tool_permissions.mcp_servers.map((s) => [s.name, s.scope]));
    expect(scopes["Salesforce MCP"]).toBe("draft_only");
    expect(scopes["Slack MCP"]).toBe("draft_only");
    expect(scopes["Looker MCP"]).toBe("read_only");
    expect(clamped.tool_permissions.mcp_servers[0].reason).toContain("downgraded");
    // input is not mutated
    expect(authored.tool_permissions.mcp_servers[0].scope).toBe("full");
  });

  it("passes through specs without tool permissions untouched", () => {
    expect(clampAuthoredSpec({ goal: "x" })).toEqual({ goal: "x" });
    expect(clampAuthoredSpec({ tool_permissions: { enabled: [] } })).toEqual({ tool_permissions: { enabled: [] } });
  });
});
