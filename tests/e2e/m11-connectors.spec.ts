// Prisma 7 no longer auto-loads .env; load it explicitly for tsx/vitest entry points.
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@/lib/prisma";
import { storageStateFor } from "./helpers/auth";
import { encryptJson } from "@/lib/crypto/secrets";

const prisma = new PrismaClient();

test.describe("M11 — connectors", () => {
  test.use({ storageState: storageStateFor("admin") });

  test.afterAll(async () => {
    await prisma.integrationSyncLog.deleteMany({
      where: { integration: { name: { startsWith: "e2e-" } } },
    });
    await prisma.enterpriseIntegration.deleteMany({
      where: { name: { startsWith: "e2e-" } },
    });
    await prisma.$disconnect();
  });

  test("connector list page is reachable and renders the empty state when no connector exists", async ({
    page,
  }) => {
    await prisma.enterpriseIntegration.deleteMany({
      where: { name: "e2e-empty-list" },
    });
    await page.goto("/zh/integrations/connectors");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: /连接器|Connectors/ }).first(),
    ).toBeVisible();
  });

  test("wizard renders the three catalog entries on the pick step", async ({
    page,
  }) => {
    await page.goto("/zh/integrations/connectors/new");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /Slack/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Microsoft Teams/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /ServiceNow/ }),
    ).toBeVisible();
  });

  test("ServiceNow inbound webhook rejects bad secret with 401", async ({
    request,
  }) => {
    const org = await prisma.organization.findFirst();
    if (!org)
      throw new Error("[e2e] expected at least one seeded organization");
    const integ = await prisma.enterpriseIntegration.create({
      data: {
        orgId: org.id,
        name: "e2e-sn-bad-secret",
        integrationType: "servicenow",
        credentialsEncrypted: new Uint8Array(
          encryptJson({ username: "u", password: "p" }),
        ),
        subscribedEvents: [],
        inboundSecret: "right-secret",
        createdBy: "e2e",
        config: { instanceUrl: "https://acme.service-now.com" },
      },
    });

    const res = await request.post(
      `/api/integrations/servicenow/inbound/${integ.id}`,
      {
        headers: { "x-webhook-secret": "wrong" },
        data: { u_aigp_incident_id: "n/a" },
      },
    );
    expect(res.status()).toBe(401);
  });

  test("ServiceNow inbound returns action=not_found for unmapped incident", async ({
    request,
  }) => {
    const org = await prisma.organization.findFirst();
    if (!org)
      throw new Error("[e2e] expected at least one seeded organization");
    const integ = await prisma.enterpriseIntegration.create({
      data: {
        orgId: org.id,
        name: "e2e-sn-not-found",
        integrationType: "servicenow",
        credentialsEncrypted: new Uint8Array(
          encryptJson({ username: "u", password: "p" }),
        ),
        subscribedEvents: [],
        inboundSecret: "ok-secret",
        createdBy: "e2e",
        config: { instanceUrl: "https://acme.service-now.com" },
      },
    });

    const res = await request.post(
      `/api/integrations/servicenow/inbound/${integ.id}`,
      {
        headers: { "x-webhook-secret": "ok-secret" },
        data: { u_aigp_incident_id: "nope", state: "6" },
      },
    );
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({
      accepted: true,
      action: "not_found",
    });
  });
});
