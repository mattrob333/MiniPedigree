import { describe, it, expect, vi, beforeEach } from "vitest";
import { companyContextSchema } from "../src/lib/schemas";

describe("company profile URL safety", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = "";
  });

  it("normalizes bare public domains to https", async () => {
    const { normalizeCompanyUrl } = await import("../server/core/companyProfile");
    expect(normalizeCompanyUrl("example.com")).toBe("https://example.com");
  });

  it("rejects non-https, localhost, private IPs, and malformed URLs", async () => {
    const { normalizeCompanyUrl } = await import("../server/core/companyProfile");
    expect(() => normalizeCompanyUrl("http://example.com")).toThrow(/https/i);
    expect(() => normalizeCompanyUrl("https://user:pass@example.com")).toThrow(/credentials/i);
    expect(() => normalizeCompanyUrl("https://localhost")).toThrow(/public/i);
    expect(() => normalizeCompanyUrl("https://192.168.1.12")).toThrow(/private/i);
    expect(() => normalizeCompanyUrl("https://[::1]")).toThrow(/private|public/i);
    expect(() => normalizeCompanyUrl("not a url")).toThrow(/malformed/i);
  });
});

describe("company profile parser", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = "";
  });

  it("returns a usable demo profile when OpenAI is not configured", async () => {
    const { runCompanyProfileParse } = await import("../server/core/companyProfile");
    const out = await runCompanyProfileParse({
      company: "Northstar SaaS",
      url: "northstar.example",
      notes: "We sell revenue operations software to B2B SaaS teams. We use Salesforce, Slack, Workday, and Zendesk.",
      research_url: true,
    });
    expect(out.mode).toBe("demo");
    expect(out.profile.company).toBe("Northstar SaaS");
    expect(out.profile.url).toBe("https://northstar.example");
    expect(out.profile.rawNotes).toContain("revenue operations");
    expect(out.profile.systems).toEqual(expect.arrayContaining(["Salesforce", "Slack", "Workday", "Zendesk"]));
  });

  it("normalizes legacy saved company contexts", () => {
    const legacy = companyContextSchema.parse({
      company: "Legacy Co",
      whatWeDo: "Legacy context.",
      strategicGoals: "Improve onboarding.",
    });
    expect(legacy.company).toBe("Legacy Co");
    expect(legacy.whatWeDo).toBe("Legacy context.");
    expect(legacy.systems).toEqual([]);
    expect(legacy.researchSources).toEqual([]);
    expect(legacy.contextDocuments).toEqual([]);
  });

  it("stores uploaded company context documents in explicit buckets", () => {
    const parsed = companyContextSchema.parse({
      company: "Policy Co",
      whatWeDo: "Makes policy software.",
      contextDocuments: [{
        id: "policy:approval.md:120:1",
        bucket: "policy",
        fileName: "approval.md",
        title: "approval.md",
        mimeType: "text/markdown",
        sizeBytes: 120,
        text: "Managers approve spend above $500.",
        uploadedAt: "2026-06-02T00:00:00.000Z",
        sourceId: "uploaded-context:policy%3Aapproval.md",
      }],
    });
    expect(parsed.contextDocuments).toHaveLength(1);
    expect(parsed.contextDocuments[0].bucket).toBe("policy");
    expect(parsed.contextDocuments[0].text).toContain("Managers approve");
  });
});

describe("discovery route", () => {
  it("passes company_context through to the core parser", async () => {
    vi.resetModules();
    const runDiscoveryParse = vi.fn(async () => ({ mode: "demo", reason: "ok" }));
    vi.doMock("../server/core/parse.js", () => ({ runDiscoveryParse }));

    const { discoveryParseHandler } = await import("../server/routes/discoveryParse");
    const req = {
      body: {
        transcript: "Morgan owns revenue forecasting.",
        people: [],
        company_context: { company: "Northstar SaaS", whatWeDo: "Revenue ops software" },
      },
    };
    const res = { json: vi.fn() };

    await discoveryParseHandler(req as any, res as any);

    expect(runDiscoveryParse).toHaveBeenCalledWith({
      transcript: req.body.transcript,
      people: req.body.people,
      company_context: req.body.company_context,
    });
    expect(res.json).toHaveBeenCalledWith({ mode: "demo", reason: "ok" });
  });
});
