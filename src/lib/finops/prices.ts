export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

export const PRICES: Record<string, Record<string, ModelPrice>> = {
  openai: {
    "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
    "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    o1: { inputPerMillion: 15.0, outputPerMillion: 60.0 },
    "o1-mini": { inputPerMillion: 3.0, outputPerMillion: 12.0 },
  },
  anthropic: {
    "claude-opus-4-7": { inputPerMillion: 15.0, outputPerMillion: 75.0 },
    "claude-sonnet-4-6": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
    "claude-haiku-4-5-20251001": {
      inputPerMillion: 0.8,
      outputPerMillion: 4.0,
    },
  },
  azure_openai: {
    "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
    "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  },
  google_gemini: {
    "gemini-2.0-flash": { inputPerMillion: 0.1, outputPerMillion: 0.4 },
    "gemini-1.5-pro": { inputPerMillion: 1.25, outputPerMillion: 5.0 },
  },
  openai_compatible: {
    "deepseek-chat": { inputPerMillion: 0.14, outputPerMillion: 0.28 },
    "deepseek-reasoner": { inputPerMillion: 0.55, outputPerMillion: 2.19 },
    "qwen-plus": { inputPerMillion: 0.4, outputPerMillion: 1.2 },
    "qwen-max": { inputPerMillion: 2.8, outputPerMillion: 8.4 },
    "moonshot-v1-32k": { inputPerMillion: 6.0, outputPerMillion: 6.0 },
    "glm-4-plus": { inputPerMillion: 7.1, outputPerMillion: 7.1 },
    "doubao-pro-32k": { inputPerMillion: 0.8, outputPerMillion: 2.0 },
    "ernie-4.0-8k": { inputPerMillion: 4.0, outputPerMillion: 16.0 },
  },
  anthropic_compatible: {
    "claude-sonnet-4-20250514": {
      inputPerMillion: 3.0,
      outputPerMillion: 15.0,
    },
  },
};

export function lookupPrice(
  providerType: string,
  model: string,
): ModelPrice | undefined {
  return PRICES[providerType]?.[model];
}
