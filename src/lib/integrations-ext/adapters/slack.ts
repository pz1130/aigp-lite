import type { EnterpriseIntegration } from "@/lib/prisma";
import type { IntegrationAdapter, OutboundEvent, SendResult } from "../types";
import { deliverWebhook } from "./shared-webhook";

function formatCard(ev: OutboundEvent): { text: string; blocks: unknown[] } {
  const p = ev.payload as Record<string, unknown>;

  if (ev.type === "incident.created" || ev.type === "incident.statusChanged") {
    const sev = String(p.severity ?? "n/a").toUpperCase();
    return {
      text: `[${sev}] Incident: ${p.title}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*[${sev}] Incident*\n${p.title}\nStatus: \`${p.status ?? "open"}\``,
          },
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: `Incident ID: \`${p.id}\`` }],
        },
      ],
    };
  }

  if (ev.type === "policy.blocked") {
    return {
      text: `Policy blocked: ${p.policyName}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Policy blocked*: ${p.policyName}\n\`\`\`${String(p.snippet ?? "").slice(0, 200)}\`\`\``,
          },
        },
      ],
    };
  }

  if (ev.type === "budget.threshold.exceeded") {
    return {
      text: `Budget ${p.threshold}% reached`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Budget threshold ${p.threshold}% reached*\nScope: ${p.scope} · Period: ${p.period} · Amount: $${p.amountUsd}`,
          },
        },
      ],
    };
  }

  if (ev.type === "runtime.llm.blocked") {
    return {
      text: "LLM call blocked by policy",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*LLM call blocked*\nProvider: ${p.provider} · Model: ${p.model}`,
          },
        },
      ],
    };
  }

  if (ev.type === "integration.test") {
    return {
      text: "AIGP test message",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "✓ AIGP integration test message — your connector is reachable.",
          },
        },
      ],
    };
  }

  return {
    text: `Event: ${ev.type}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `\`${ev.type}\`` } },
    ],
  };
}

export const slackAdapter: IntegrationAdapter = {
  async send(
    _integration: EnterpriseIntegration,
    ev: OutboundEvent,
    creds: Record<string, string>,
  ): Promise<SendResult> {
    const body = formatCard(ev);
    const r = await deliverWebhook(creds.webhookUrl, body);
    return { payloadHash: r.payloadHash };
  },
};
