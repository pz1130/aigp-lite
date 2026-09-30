import { ProviderType } from "@/lib/prisma";

export type CredField = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
};
export type ConfigField = {
  key: string;
  label: string;
  type: "string" | "enum";
  enum?: string[];
  required: boolean;
  placeholder?: string;
};

export type CatalogEntry = {
  providerType: ProviderType;
  slug: string;
  displayNameKey: string;
  descriptionKey: string;
  defaultBaseUrl?: string;
  baseUrlEditable: boolean;
  credFields: CredField[];
  configFields: ConfigField[];
  sampleModels: string[];
  docsUrl?: string;
};

const apiKeyField: CredField = {
  key: "apiKey",
  label: "provider.field.apiKey",
  secret: true,
  required: true,
};

export const CATALOG: CatalogEntry[] = [
  {
    providerType: "openai",
    slug: "openai",
    displayNameKey: "provider.catalog.openai.name",
    descriptionKey: "provider.catalog.openai.description",
    defaultBaseUrl: "https://api.openai.com/v1",
    baseUrlEditable: true,
    credFields: [apiKeyField],
    configFields: [],
    sampleModels: ["gpt-4o", "gpt-4o-mini"],
    docsUrl: "https://platform.openai.com/docs",
  },

  {
    providerType: "anthropic",
    slug: "anthropic",
    displayNameKey: "provider.catalog.anthropic.name",
    descriptionKey: "provider.catalog.anthropic.description",
    defaultBaseUrl: "https://api.anthropic.com",
    baseUrlEditable: true,
    credFields: [apiKeyField],
    configFields: [],
    sampleModels: ["claude-opus-4-7", "claude-sonnet-4-6"],
    docsUrl: "https://docs.claude.com",
  },

  {
    providerType: "azure_openai",
    slug: "azure-openai",
    displayNameKey: "provider.catalog.azureOpenAi.name",
    descriptionKey: "provider.catalog.azureOpenAi.description",
    baseUrlEditable: true,
    credFields: [apiKeyField],
    configFields: [
      {
        key: "endpoint",
        label: "provider.field.endpoint",
        type: "string",
        required: true,
        placeholder: "https://my-resource.openai.azure.com",
      },
      {
        key: "deployment",
        label: "provider.field.deployment",
        type: "string",
        required: true,
        placeholder: "gpt-4o-deployment",
      },
      {
        key: "apiVersion",
        label: "provider.field.apiVersion",
        type: "string",
        required: true,
        placeholder: "2024-08-01-preview",
      },
    ],
    sampleModels: ["(uses deployment name)"],
  },

  {
    providerType: "google_gemini",
    slug: "google-gemini",
    displayNameKey: "provider.catalog.googleGemini.name",
    descriptionKey: "provider.catalog.googleGemini.description",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    baseUrlEditable: true,
    credFields: [apiKeyField],
    configFields: [],
    sampleModels: ["gemini-2.0-flash", "gemini-1.5-pro"],
    docsUrl: "https://ai.google.dev/gemini-api/docs",
  },

  {
    providerType: "openai_compatible",
    slug: "deepseek",
    displayNameKey: "provider.catalog.deepseek.name",
    descriptionKey: "provider.catalog.deepseek.description",
    defaultBaseUrl: "https://api.deepseek.com",
    baseUrlEditable: true,
    credFields: [apiKeyField],
    configFields: [],
    sampleModels: ["deepseek-chat", "deepseek-reasoner"],
  },

  {
    providerType: "openai_compatible",
    slug: "qwen-dashscope",
    displayNameKey: "provider.catalog.qwen.name",
    descriptionKey: "provider.catalog.qwen.description",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    baseUrlEditable: true,
    credFields: [apiKeyField],
    configFields: [],
    sampleModels: ["qwen-plus", "qwen-max"],
  },

  {
    providerType: "openai_compatible",
    slug: "moonshot-kimi",
    displayNameKey: "provider.catalog.kimi.name",
    descriptionKey: "provider.catalog.kimi.description",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    baseUrlEditable: true,
    credFields: [apiKeyField],
    configFields: [],
    sampleModels: ["moonshot-v1-8k", "moonshot-v1-32k"],
  },

  {
    providerType: "openai_compatible",
    slug: "zhipu-glm",
    displayNameKey: "provider.catalog.zhipu.name",
    descriptionKey: "provider.catalog.zhipu.description",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    baseUrlEditable: true,
    credFields: [apiKeyField],
    configFields: [],
    sampleModels: ["glm-4", "glm-4-plus"],
  },

  {
    providerType: "openai_compatible",
    slug: "minimax",
    displayNameKey: "provider.catalog.minimax.name",
    descriptionKey: "provider.catalog.minimax.description",
    defaultBaseUrl: "https://api.minimax.chat/v1",
    baseUrlEditable: true,
    credFields: [apiKeyField],
    configFields: [],
    sampleModels: ["abab6.5s-chat"],
  },

  {
    providerType: "openai_compatible",
    slug: "doubao-volcengine",
    displayNameKey: "provider.catalog.doubao.name",
    descriptionKey: "provider.catalog.doubao.description",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    baseUrlEditable: true,
    credFields: [apiKeyField],
    configFields: [],
    sampleModels: ["doubao-pro-32k"],
  },

  {
    providerType: "openai_compatible",
    slug: "baidu-qianfan",
    displayNameKey: "provider.catalog.wenxin.name",
    descriptionKey: "provider.catalog.wenxin.description",
    defaultBaseUrl: "https://qianfan.baidubce.com/v2",
    baseUrlEditable: true,
    credFields: [apiKeyField],
    configFields: [],
    sampleModels: ["ernie-4.0-8k"],
  },

  {
    providerType: "openai_compatible",
    slug: "ollama",
    displayNameKey: "provider.catalog.ollama.name",
    descriptionKey: "provider.catalog.ollama.description",
    defaultBaseUrl: "http://localhost:11434/v1",
    baseUrlEditable: true,
    credFields: [
      {
        key: "apiKey",
        label: "provider.field.apiKey",
        secret: true,
        required: false,
      },
    ],
    configFields: [],
    sampleModels: ["llama3", "mistral"],
  },

  {
    providerType: "openai_compatible",
    slug: "custom-openai",
    displayNameKey: "provider.catalog.customOpenAi.name",
    descriptionKey: "provider.catalog.customOpenAi.description",
    baseUrlEditable: true,
    credFields: [apiKeyField],
    configFields: [],
    sampleModels: [],
  },

  {
    providerType: "anthropic_compatible",
    slug: "custom-anthropic",
    displayNameKey: "provider.catalog.customAnthropic.name",
    descriptionKey: "provider.catalog.customAnthropic.description",
    baseUrlEditable: true,
    credFields: [apiKeyField],
    configFields: [],
    sampleModels: [],
  },
];

export function getCatalogEntry(slug: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.slug === slug);
}

export function validateCatalog(): void {
  const slugs = new Set<string>();
  for (const e of CATALOG) {
    if (slugs.has(e.slug)) throw new Error(`catalog: duplicate slug ${e.slug}`);
    slugs.add(e.slug);
    if (!e.baseUrlEditable && !e.defaultBaseUrl) {
      throw new Error(
        `catalog ${e.slug}: defaultBaseUrl required when baseUrlEditable=false`,
      );
    }
  }
  const seenTypes = new Set(CATALOG.map((e) => e.providerType));
  for (const t of [
    "openai",
    "anthropic",
    "azure_openai",
    "google_gemini",
    "openai_compatible",
    "anthropic_compatible",
  ]) {
    if (!seenTypes.has(t as ProviderType))
      throw new Error(`catalog: missing providerType ${t}`);
  }
}
