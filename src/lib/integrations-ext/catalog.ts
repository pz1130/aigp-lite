import type { IntegrationType } from "@/lib/prisma";

export interface CredField {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  placeholder?: string;
}
export interface ConfigField {
  key: string;
  label: string;
  type: "string";
  required: boolean;
  placeholder?: string;
}

export interface IntegrationCatalogEntry {
  integrationType: IntegrationType;
  displayNameKey: string;
  descriptionKey: string;
  credFields: CredField[];
  configFields: ConfigField[];
  inboundEnabled: boolean;
  docsKey: string;
}

export const CATALOG: IntegrationCatalogEntry[] = [
  {
    integrationType: "slack_webhook",
    displayNameKey: "integrations.connector.slack.name",
    descriptionKey: "integrations.connector.slack.description",
    credFields: [
      {
        key: "webhookUrl",
        label: "integrations.connector.field.webhookUrl",
        secret: true,
        required: true,
        placeholder: "https://hooks.slack.com/services/...",
      },
    ],
    configFields: [],
    inboundEnabled: false,
    docsKey: "integrations.connector.slack.docs",
  },
  {
    integrationType: "teams_webhook",
    displayNameKey: "integrations.connector.teams.name",
    descriptionKey: "integrations.connector.teams.description",
    credFields: [
      {
        key: "webhookUrl",
        label: "integrations.connector.field.webhookUrl",
        secret: true,
        required: true,
        placeholder: "https://outlook.office.com/webhook/...",
      },
    ],
    configFields: [],
    inboundEnabled: false,
    docsKey: "integrations.connector.teams.docs",
  },
  {
    integrationType: "servicenow",
    displayNameKey: "integrations.connector.servicenow.name",
    descriptionKey: "integrations.connector.servicenow.description",
    credFields: [
      {
        key: "username",
        label: "integrations.connector.field.username",
        secret: false,
        required: true,
      },
      {
        key: "password",
        label: "integrations.connector.field.password",
        secret: true,
        required: true,
      },
    ],
    configFields: [
      {
        key: "instanceUrl",
        label: "integrations.connector.field.instanceUrl",
        type: "string",
        required: true,
        placeholder: "https://acme.service-now.com",
      },
    ],
    inboundEnabled: true,
    docsKey: "integrations.connector.servicenow.docs",
  },
];

export function getIntegrationCatalogEntry(
  t: IntegrationType,
): IntegrationCatalogEntry {
  const e = CATALOG.find((x) => x.integrationType === t);
  if (!e) throw new Error(`unknown integration type ${t}`);
  return e;
}
