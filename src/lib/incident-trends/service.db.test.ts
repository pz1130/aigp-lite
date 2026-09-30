import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  generateReport,
  publishReport,
  getReport,
  listReports,
} from "./service";
import { workflowEvents } from "@/lib/events/workflow-bus";

// Minimal org/user/incident factory helpers reuse the project's existing
// test seeding pattern — see src/lib/transparency-report/router.db.test.ts for
// the canonical createOrg/createUser helpers and mirror them here.
async function seedOrgUser() {
  const org = await prisma.organization.create({
    data: { name: `trends-${Math.random()}` },
  });
  const user = await prisma.user.create({
    data: { email: `u-${Math.random()}@x.io`, name: "U" },
  });
  return { org, user };
}

async function seedIncident(
  orgId: string,
  userId: string,
  embedding: number[] | null,
  over: Partial<{ category: string; severity: string; title: string }> = {},
) {
  return prisma.incident.create({
    data: {
      orgId,
      title: over.title ?? "incident",
      severity: (over.severity as never) ?? "high",
      status: "open",
      category: (over.category as never) ?? "data_leak",
      openedById: userId,
      embedding: embedding ?? undefined,
    },
  });
}

const NO_LLM = { llmEnabled: () => false };

afterAll(async () => {
  await prisma.$disconnect();
});

describe("generateReport", () => {
  let org: { id: string };
  let user: { id: string };
  beforeEach(async () => {
    const s = await seedOrgUser();
    org = s.org;
    user = s.user;
  });

  it("clusters incidents and freezes a draft snapshot (no LLM)", async () => {
    await seedIncident(org.id, user.id, [1, 0], { title: "a" });
    await seedIncident(org.id, user.id, [0.99, 0.01], { title: "b" });
    await seedIncident(org.id, user.id, [0, 1], { title: "c" });

    const { reportId } = await generateReport(
      { orgId: org.id, userId: user.id },
      NO_LLM,
    );
    const { report, clusters } = await getReport(org.id, reportId);

    expect(report.status).toBe("draft");
    expect(report.version).toBe(1);
    expect(report.incidentCount).toBe(3);
    // one 2-member narrated cluster + one long-tail bucket
    const narrated = clusters.filter((c) => !c.isLongTail);
    expect(narrated).toHaveLength(1);
    expect((narrated[0].memberIncidentIds as string[]).length).toBe(2);
    // narrative empty because LLM disabled; diagnostic recorded
    expect(narrated[0].narrative).toBe("");
    const codes = (report.diagnostics as { code: string }[]).map((d) => d.code);
    expect(codes).toContain("llm_unavailable");
  });

  it("falls back to category grouping when no embeddings exist", async () => {
    await seedIncident(org.id, user.id, null, { category: "data_leak" });
    await seedIncident(org.id, user.id, null, { category: "data_leak" });
    const { reportId } = await generateReport(
      { orgId: org.id, userId: user.id },
      NO_LLM,
    );
    const { report } = await getReport(org.id, reportId);
    const codes = (report.diagnostics as { code: string }[]).map((d) => d.code);
    expect(codes).toContain("embedding_fallback");
  });

  it("flags insufficient data below the floor", async () => {
    await seedIncident(org.id, user.id, [1, 0]);
    const { reportId } = await generateReport(
      { orgId: org.id, userId: user.id },
      NO_LLM,
    );
    const { report } = await getReport(org.id, reportId);
    const codes = (report.diagnostics as { code: string }[]).map((d) => d.code);
    expect(codes).toContain("insufficient_data");
  });

  it("LLM-success path: persists narrative and execSummary", async () => {
    const fakeLlm = async (_system: string, _user: string) => ({
      rawText: JSON.stringify({
        label: "xx",
        narrative: "x".repeat(20),
        systemicRecommendation: "y".repeat(10),
        confidence: "high",
        execSummary: "z".repeat(20),
      }),
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 10,
      providerType: "openai",
      model: "gpt-4o",
    });

    await seedIncident(org.id, user.id, [1, 0], { title: "a" });
    await seedIncident(org.id, user.id, [0.99, 0.01], { title: "b" });
    await seedIncident(org.id, user.id, [0, 1], { title: "c" });

    const { reportId } = await generateReport(
      { orgId: org.id, userId: user.id },
      { llmEnabled: () => true, callLlm: fakeLlm },
    );
    const { report, clusters } = await getReport(org.id, reportId);

    const narrated = clusters.filter((c) => !c.isLongTail);
    expect(narrated).toHaveLength(1);
    expect(narrated[0].narrative).not.toBe("");
    expect(narrated[0].label).not.toBe("");
    expect(narrated[0].systemicRecommendation).not.toBe("");
    expect(narrated[0].confidence).toBe("high");
    expect(report.execSummary).not.toBe("");
  });

  it("LLM parse-failure: does not throw, logs cluster_llm_failed and exec_summary_failed", async () => {
    const badLlm = async (_system: string, _user: string) => ({
      rawText: "not-json",
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
      providerType: "openai",
      model: "gpt-4o",
    });

    await seedIncident(org.id, user.id, [1, 0], { title: "a" });
    await seedIncident(org.id, user.id, [0.99, 0.01], { title: "b" });
    await seedIncident(org.id, user.id, [0, 1], { title: "c" });

    const { reportId } = await generateReport(
      { orgId: org.id, userId: user.id },
      { llmEnabled: () => true, callLlm: badLlm },
    );
    const { report, clusters } = await getReport(org.id, reportId);

    const codes = (report.diagnostics as { code: string }[]).map((d) => d.code);
    expect(codes).toContain("cluster_llm_failed");
    expect(codes).toContain("exec_summary_failed");

    const narrated = clusters.filter((c) => !c.isLongTail);
    expect(narrated).toHaveLength(1);
    expect(narrated[0].narrative).toBe("");
  });
});

describe("publishReport", () => {
  it("publishes a draft and supersedes the prior published report", async () => {
    const { org, user } = await seedOrgUser();
    await seedIncident(org.id, user.id, [1, 0]);
    await seedIncident(org.id, user.id, [0.99, 0.01]);

    const r1 = await generateReport({ orgId: org.id, userId: user.id }, NO_LLM);
    await publishReport({ orgId: org.id, id: r1.reportId, userId: user.id });

    const r2 = await generateReport({ orgId: org.id, userId: user.id }, NO_LLM);
    await publishReport({ orgId: org.id, id: r2.reportId, userId: user.id });

    const all = await listReports(org.id);
    const first = all.find((r) => r.id === r1.reportId)!;
    const second = all.find((r) => r.id === r2.reportId)!;
    expect(first.status).toBe("superseded");
    expect(second.status).toBe("published");
    expect(second.version).toBe(2);
    expect((second.deltaJson as { baseline: boolean }).baseline).toBe(false);
  });
});

describe("publishReport trend alerts", () => {
  it("emits incident-trends.alert when the published report has worsening signals", async () => {
    const { org, user } = await seedOrgUser();

    // Report #1 (baseline): 2 high/data_leak incidents.
    // Stats stored: bySeverity["high"]=2, byCategory["data_leak"]=2.
    await seedIncident(org.id, user.id, null, {
      severity: "high",
      category: "data_leak",
    });
    await seedIncident(org.id, user.id, null, {
      severity: "high",
      category: "data_leak",
    });
    const r1 = await generateReport({ orgId: org.id, userId: user.id }, NO_LLM);
    await publishReport({ orgId: org.id, id: r1.reportId, userId: user.id });

    // Add 4 more high/data_leak incidents before report #2.
    // Report #2 totals: 6 high, 6 data_leak.
    // Deltas vs r1: bySeverity["high"].delta=4 >=floor(3) → severity_increase;
    //               byCategory["data_leak"].delta=4 >=3 → category_increase;
    //               totalDelta=4 >=3 & totalPct=200% >=25% → total_increase.
    await seedIncident(org.id, user.id, null, {
      severity: "high",
      category: "data_leak",
    });
    await seedIncident(org.id, user.id, null, {
      severity: "high",
      category: "data_leak",
    });
    await seedIncident(org.id, user.id, null, {
      severity: "high",
      category: "data_leak",
    });
    await seedIncident(org.id, user.id, null, {
      severity: "high",
      category: "data_leak",
    });

    const events: { reportId: string; signalCount: number }[] = [];
    const handler = (p: { reportId: string; signalCount: number }) =>
      events.push({ reportId: p.reportId, signalCount: p.signalCount });
    workflowEvents.onIncidentTrendsAlert(handler);
    try {
      const r2 = await generateReport(
        { orgId: org.id, userId: user.id },
        NO_LLM,
      );
      const published2 = await publishReport({
        orgId: org.id,
        id: r2.reportId,
        userId: user.id,
      });
      await new Promise((res) => setTimeout(res, 50));
      const mine = events.filter((e) => e.reportId === published2.id);
      expect(mine).toHaveLength(1);
      expect(mine[0].signalCount).toBeGreaterThan(0);
    } finally {
      workflowEvents.off("incident-trends.alert", handler);
    }
  });

  it("does NOT emit for a baseline (first) published report", async () => {
    const { org, user } = await seedOrgUser();
    // Seed 3 incidents so the report isn't flagged insufficient_data, but this
    // is the org's very first report so deltas.baseline === true and no alert fires.
    await seedIncident(org.id, user.id, null, {
      severity: "high",
      category: "data_leak",
    });
    await seedIncident(org.id, user.id, null, {
      severity: "high",
      category: "data_leak",
    });
    await seedIncident(org.id, user.id, null, {
      severity: "high",
      category: "data_leak",
    });

    const events: string[] = [];
    const handler = (p: { reportId: string }) => events.push(p.reportId);
    workflowEvents.onIncidentTrendsAlert(handler);
    try {
      const r1 = await generateReport(
        { orgId: org.id, userId: user.id },
        NO_LLM,
      );
      const published1 = await publishReport({
        orgId: org.id,
        id: r1.reportId,
        userId: user.id,
      });
      await new Promise((res) => setTimeout(res, 50));
      expect(events).not.toContain(published1.id);
    } finally {
      workflowEvents.off("incident-trends.alert", handler);
    }
  });
});
