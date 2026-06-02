import { describe, expect, it } from "vitest";
import { findBrand } from "../src/components/BrandLogo";

describe("brand logo mapping", () => {
  it("matches HRIS coming-soon brands", () => {
    expect(findBrand("Workday HRIS")?.id).toBe("workday");
    expect(findBrand("Oracle Cloud HCM")?.id).toBe("oracle");
  });

  it("matches MCP and tool labels used in manifests", () => {
    expect(findBrand("Salesforce MCP")?.id).toBe("salesforce");
    expect(findBrand("Google Drive MCP · read-only")?.id).toBe("google-drive");
    expect(findBrand("GitHub Actions")?.id).toBe("github");
  });

  it("matches sample-company tool logos", () => {
    expect(findBrand("Google Workspace")?.id).toBe("google");
    expect(findBrand("Google Sheets")?.id).toBe("google-sheets");
    expect(findBrand("Microsoft 365")?.id).toBe("microsoft-office");
    expect(findBrand("Excel")?.id).toBe("microsoft-excel");
    expect(findBrand("Figma")?.id).toBe("figma");
    expect(findBrand("Vercel")?.id).toBe("vercel");
    expect(findBrand("Supabase")?.id).toBe("supabase");
    expect(findBrand("OpenAI")?.id).toBe("openai");
    expect(findBrand("Apollo")?.id).toBe("apollo");
    expect(findBrand("Monday.com")?.id).toBe("monday");
    expect(findBrand("LinkedIn Ads")?.id).toBe("linkedin");
  });

  it("matches company-context connector logos", () => {
    expect(findBrand("Okta")?.id).toBe("okta");
    expect(findBrand("Microsoft Entra ID")?.id).toBe("microsoft-entra");
    expect(findBrand("Microsoft Intra ID")?.id).toBe("microsoft-entra");
  });
});
