import { describe, it, expect } from "vitest";
import { parsePeopleCsv } from "../src/lib/csv";

describe("parsePeopleCsv", () => {
  it("maps manager_email references to internal manager ids", () => {
    const csv = `name,email,title,manager_email,department,known_tools
Ann Lead,ann@x.co,CEO,,Exec,"Slack"
Bob Rep,bob@x.co,Manager,ann@x.co,Sales,"Salesforce,Slack"
Cara IC,cara@x.co,Analyst,bob@x.co,Sales,"Excel"`;
    const r = parsePeopleCsv(csv, "demo.csv");
    expect(r.errors).toEqual([]);
    expect(r.people).toHaveLength(3);
    const ann = r.people.find((p) => p.email === "ann@x.co")!;
    const bob = r.people.find((p) => p.email === "bob@x.co")!;
    const cara = r.people.find((p) => p.email === "cara@x.co")!;
    expect(ann.managerId).toBeNull();
    expect(bob.managerId).toBe(ann.id);
    expect(cara.managerId).toBe(bob.id);
    expect(bob.tools).toEqual(["Salesforce", "Slack"]);
  });

  it("rejects CSVs missing required columns", () => {
    const r = parsePeopleCsv("name,title\nAnn,CEO", "bad.csv");
    expect(r.errors.some((e) => e.includes("email"))).toBe(true);
    expect(r.people).toHaveLength(0);
  });

  it("warns on duplicate emails and unresolved managers", () => {
    const csv = `name,email,title,manager_email
Ann,ann@x.co,CEO,
Ann2,ann@x.co,Dup,
Bob,bob@x.co,Mgr,ghost@x.co`;
    const r = parsePeopleCsv(csv, "dupes.csv");
    expect(r.people).toHaveLength(2); // duplicate skipped
    expect(r.warnings.some((w) => w.toLowerCase().includes("duplicate"))).toBe(true);
    expect(r.warnings.some((w) => w.toLowerCase().includes("not found"))).toBe(true);
  });

  it("breaks reporting cycles", () => {
    const csv = `name,email,title,manager_email
A,a@x.co,One,b@x.co
B,b@x.co,Two,a@x.co`;
    const r = parsePeopleCsv(csv, "cycle.csv");
    // at least one link removed so no infinite chain
    const roots = r.people.filter((p) => p.managerId === null);
    expect(roots.length).toBeGreaterThanOrEqual(1);
  });

  it("derives a workspace name from the file name", () => {
    const r = parsePeopleCsv("name,email,title,manager_email\nA,a@x.co,CEO,", "02_northstar_saas_20_people.csv");
    expect(r.workspaceName).toBe("Northstar Saas");
  });
});
