import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { aggregate } from "./aggregator";
import type { ReportTemplate } from "./types";

const ORG = "org-agg-test";
const TEST_USER_ID = "user-agg-test";

const stubTemplate: ReportTemplate = {
  id: "nist-ai-rmf",
  displayKey: "k",
  version: "1.0",
  controls: [
    {
      id: "C1",
      title: "Has inventory",
      category: "Cat A",
      description: "...",
      dataSource: "inventory",
    },
    {
      id: "C2",
      title: "Has policy",
      category: "Cat A",
      description: "...",
      dataSource: "policy",
    },
    {
      id: "C3",
      title: "Static text",
      category: "Cat B",
      description: "always implemented",
      dataSource: "narrative",
    },
    {
      id: "C4",
      title: "Has risk",
      category: "Cat C",
      description: "...",
      dataSource: "risk",
    },
    {
      id: "C5",
      title: "Has audit",
      category: "Cat C",
      description: "...",
      dataSource: "audit",
      query: { actionPrefix: "policy." },
    },
    {
      id: "C6",
      title: "Has incident",
      category: "Cat D",
      description: "...",
      dataSource: "incident",
    },
    {
      id: "C7",
      title: "Has maturity",
      category: "Cat E",
      description: "...",
      dataSource: "maturity",
    },
    {
      id: "C8",
      title: "Has workflow",
      category: "Cat F",
      description: "...",
      dataSource: "workflow",
    },
    {
      id: "C9",
      title: "Has evidence",
      category: "Cat G",
      description: "...",
      dataSource: "evidence",
    },
    {
      id: "C10",
      title: "Has lineage",
      category: "Cat H",
      description: "...",
      dataSource: "data_lineage",
    },
  ],
};

beforeEach(async () => {
  await prisma.organization.upsert({
    where: { id: ORG },
    update: {},
    create: { id: ORG, name: "Test Org" },
  });
  await prisma.user.upsert({
    where: { id: TEST_USER_ID },
    update: {},
    create: { id: TEST_USER_ID, email: "test@agg.local", name: "Test User" },
  });
});
afterEach(async () => {
  await prisma.evidence.deleteMany({ where: { orgId: ORG } });
  await prisma.auditLog.deleteMany({ where: { orgId: ORG } });
  await prisma.aiUsecase.deleteMany({ where: { orgId: ORG } });
  await prisma.policy.deleteMany({ where: { orgId: ORG } });
  await prisma.user.delete({ where: { id: TEST_USER_ID } }).catch(() => {});
});

describe("aggregate", () => {
  it("marks inventory control implemented when usecases exist", async () => {
    await prisma.aiUsecase.create({
      data: {
        orgId: ORG,
        name: "u1",
        lifecycleStage: "production",
        autonomyLevel: "assistant",
        deploymentType: "built",
        ownerId: TEST_USER_ID,
      },
    });
    const data = await aggregate({
      orgId: ORG,
      period: { start: new Date(0), end: new Date() },
      template: stubTemplate,
      generatedBy: { id: "u", name: "U" },
    });
    expect(data.controls.find((c) => c.id === "C1")?.status).toBe(
      "implemented",
    );
  });

  it("marks inventory control not-implemented when empty", async () => {
    const data = await aggregate({
      orgId: ORG,
      period: { start: new Date(0), end: new Date() },
      template: stubTemplate,
      generatedBy: { id: "u", name: "U" },
    });
    expect(data.controls.find((c) => c.id === "C1")?.status).toBe(
      "not-implemented",
    );
  });

  it("marks policy control not-implemented when no enabled policies", async () => {
    const data = await aggregate({
      orgId: ORG,
      period: { start: new Date(0), end: new Date() },
      template: stubTemplate,
      generatedBy: { id: "u", name: "U" },
    });
    expect(data.controls.find((c) => c.id === "C2")?.status).toBe(
      "not-implemented",
    );
  });

  it("narrative controls always implemented", async () => {
    const data = await aggregate({
      orgId: ORG,
      period: { start: new Date(0), end: new Date() },
      template: stubTemplate,
      generatedBy: { id: "u", name: "U" },
    });
    expect(data.controls.find((c) => c.id === "C3")?.status).toBe(
      "implemented",
    );
  });

  it("marks risk not-implemented when no assessments exist", async () => {
    const data = await aggregate({
      orgId: ORG,
      period: { start: new Date(0), end: new Date() },
      template: stubTemplate,
      generatedBy: { id: "u", name: "U" },
    });
    expect(data.controls.find((c) => c.id === "C4")?.status).toBe(
      "not-implemented",
    );
  });

  it("marks audit partial when no matching logs", async () => {
    const data = await aggregate({
      orgId: ORG,
      period: { start: new Date(0), end: new Date() },
      template: stubTemplate,
      generatedBy: { id: "u", name: "U" },
    });
    expect(data.controls.find((c) => c.id === "C5")?.status).toBe("partial");
  });

  it("marks incident implemented (process exists)", async () => {
    const data = await aggregate({
      orgId: ORG,
      period: { start: new Date(0), end: new Date() },
      template: stubTemplate,
      generatedBy: { id: "u", name: "U" },
    });
    expect(data.controls.find((c) => c.id === "C6")?.status).toBe(
      "implemented",
    );
  });

  it("marks maturity not-implemented when no assessments", async () => {
    const data = await aggregate({
      orgId: ORG,
      period: { start: new Date(0), end: new Date() },
      template: stubTemplate,
      generatedBy: { id: "u", name: "U" },
    });
    expect(data.controls.find((c) => c.id === "C7")?.status).toBe(
      "not-implemented",
    );
  });

  it("marks workflow not-implemented when no approved instances", async () => {
    const data = await aggregate({
      orgId: ORG,
      period: { start: new Date(0), end: new Date() },
      template: stubTemplate,
      generatedBy: { id: "u", name: "U" },
    });
    expect(data.controls.find((c) => c.id === "C8")?.status).toBe(
      "not-implemented",
    );
  });

  it("marks evidence not-implemented when none exist", async () => {
    const data = await aggregate({
      orgId: ORG,
      period: { start: new Date(0), end: new Date() },
      template: stubTemplate,
      generatedBy: { id: "u", name: "U" },
    });
    expect(data.controls.find((c) => c.id === "C9")?.status).toBe(
      "not-implemented",
    );
  });

  it("marks data_lineage not-implemented when no nodes", async () => {
    const data = await aggregate({
      orgId: ORG,
      period: { start: new Date(0), end: new Date() },
      template: stubTemplate,
      generatedBy: { id: "u", name: "U" },
    });
    expect(data.controls.find((c) => c.id === "C10")?.status).toBe(
      "not-implemented",
    );
  });

  it("summary counts match controls", async () => {
    const data = await aggregate({
      orgId: ORG,
      period: { start: new Date(0), end: new Date() },
      template: stubTemplate,
      generatedBy: { id: "u", name: "U" },
    });
    const s = data.summary;
    expect(s.total).toBe(10);
    expect(s.implemented + s.partial + s.notImplemented + s.na).toBe(10);
  });
});
