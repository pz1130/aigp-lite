import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { prisma } from "@/lib/db";
import { generatePolicy } from "./orchestrator";
import * as llm from "./llm-client";

const validParsed = {
  name: "Block credit cards",
  description: "Block credit-card numbers.",
  ruleJson: { regex_match: [{ var: ["text"] }, "\\d{13,19}"] },
  severity: "high" as const,
  enforcementMode: "block" as const,
  scope: "input" as const,
  tests: [
    { text: "4111111111111111", shouldHit: true, reason: "positive" },
    { text: "no card here", shouldHit: false, reason: "negative" },
    { text: "4111111111111", shouldHit: true, reason: "min boundary" },
  ],
};

let orgId: string;
let userId: string;

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `Orch ${Date.now()}` },
  });
  orgId = org.id;
  const u = await prisma.user.create({
    data: { email: `orch-${Date.now()}@x.test`, name: "U", passwordHash: "x" },
  });
  userId = u.id;
  await prisma.membership.create({ data: { orgId, userId, role: "admin" } });
  process.env.AIGP_ASSISTANT_ENABLED = "true";
  process.env.AIGP_ASSISTANT_ANTHROPIC_KEY = "sk-test";
});

afterAll(async () => {
  await prisma.policyAssistantGeneration.deleteMany({ where: { orgId } });
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.organization.delete({ where: { id: orgId } });
});

beforeEach(async () => {
  await prisma.policyAssistantGeneration.deleteMany({ where: { orgId } });
  vi.restoreAllMocks();
});

function mockLlm(rawText: string, tokens = { input: 100, output: 200 }) {
  return vi.spyOn(llm, "callAssistantLlm").mockResolvedValue({
    rawText,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    latencyMs: 50,
    providerType: "anthropic",
    model: "claude-haiku-4-5-20251001",
  });
}

describe("generatePolicy", () => {
  it("attempt 1 succeeds → status=ok, retryCount=0, 1 row persisted", async () => {
    mockLlm(JSON.stringify(validParsed));
    const r = await generatePolicy({
      description: "Block credit cards",
      orgId,
      userId,
    });
    expect(r.status).toBe("ok");
    expect(r.retryCount).toBe(0);
    expect(r.output.name).toBe("Block credit cards");
    const rows = await prisma.policyAssistantGeneration.findMany({
      where: { orgId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("ok");
    expect(rows[0].inputTokens).toBe(100);
    expect(rows[0].outputTokens).toBe(200);
    expect(rows[0].retryCount).toBe(0);
  });

  it("self-check miss → retry succeeds → status=ok, retryCount=1, merged tokens", async () => {
    const broken = {
      ...validParsed,
      ruleJson: { regex_match: [{ var: ["text"] }, "ZZZZZ"] },
    };
    const spy = mockLlm(JSON.stringify(broken));
    spy.mockResolvedValueOnce({
      rawText: JSON.stringify(broken),
      inputTokens: 100,
      outputTokens: 200,
      latencyMs: 50,
      providerType: "anthropic",
      model: "claude-haiku-4-5-20251001",
    });
    spy.mockResolvedValueOnce({
      rawText: JSON.stringify(validParsed),
      inputTokens: 150,
      outputTokens: 250,
      latencyMs: 60,
      providerType: "anthropic",
      model: "claude-haiku-4-5-20251001",
    });
    const r = await generatePolicy({ description: "x", orgId, userId });
    expect(r.status).toBe("ok");
    expect(r.retryCount).toBe(1);
    const rows = await prisma.policyAssistantGeneration.findMany({
      where: { orgId },
    });
    expect(rows[0].inputTokens).toBe(100 + 150);
    expect(rows[0].outputTokens).toBe(200 + 250);
  });

  it("retry still misses → status=needs_review, parsed persisted with diagnostics", async () => {
    const broken = {
      ...validParsed,
      ruleJson: { regex_match: [{ var: ["text"] }, "ZZZZZ"] },
    };
    const spy = mockLlm(JSON.stringify(broken));
    spy.mockResolvedValueOnce({
      rawText: JSON.stringify(broken),
      inputTokens: 50,
      outputTokens: 100,
      latencyMs: 20,
      providerType: "anthropic",
      model: "claude-haiku-4-5-20251001",
    });
    spy.mockResolvedValueOnce({
      rawText: JSON.stringify(broken),
      inputTokens: 50,
      outputTokens: 100,
      latencyMs: 20,
      providerType: "anthropic",
      model: "claude-haiku-4-5-20251001",
    });
    const r = await generatePolicy({ description: "x", orgId, userId });
    expect(r.status).toBe("needs_review");
    expect(r.output.diagnostics).toBeDefined();
    expect(
      r.output.diagnostics!.some((d) => d.kind === "self_check_miss"),
    ).toBe(true);
    const rows = await prisma.policyAssistantGeneration.findMany({
      where: { orgId },
    });
    expect(rows[0].status).toBe("needs_review");
    expect(rows[0].retryCount).toBe(1);
  });

  it("schema_parse failure → status=failed, errorMessage persisted", async () => {
    mockLlm("this is not JSON at all");
    const r = await generatePolicy({ description: "x", orgId, userId });
    expect(r.status).toBe("failed");
    const rows = await prisma.policyAssistantGeneration.findMany({
      where: { orgId },
    });
    expect(rows[0].status).toBe("failed");
    expect(rows[0].errorMessage).toBeTruthy();
  });

  it("strips ```json fences before parsing", async () => {
    mockLlm("```json\n" + JSON.stringify(validParsed) + "\n```");
    const r = await generatePolicy({ description: "x", orgId, userId });
    expect(r.status).toBe("ok");
  });

  it("LLM throws → status=failed, errorMessage stored", async () => {
    vi.spyOn(llm, "callAssistantLlm").mockRejectedValue(
      new Error("network down"),
    );
    const r = await generatePolicy({ description: "x", orgId, userId });
    expect(r.status).toBe("failed");
    const rows = await prisma.policyAssistantGeneration.findMany({
      where: { orgId },
    });
    expect(rows[0].errorMessage).toMatch(/network down/);
  });
});
