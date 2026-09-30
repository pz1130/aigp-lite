import type { IntegrationType } from "@/lib/prisma";
import { slackAdapter } from "./adapters/slack";
import { teamsAdapter } from "./adapters/teams";
import { serviceNowAdapter } from "./adapters/servicenow";
import type { IntegrationAdapter } from "./types";

const adapters: Record<IntegrationType, IntegrationAdapter> = {
  slack_webhook: slackAdapter,
  teams_webhook: teamsAdapter,
  servicenow: serviceNowAdapter,
};

export function getIntegrationAdapter(t: IntegrationType): IntegrationAdapter {
  const a = adapters[t];
  if (!a) throw new Error(`no integration adapter for ${t}`);
  return a;
}
