import { createOpenAIAdapter } from "./openai";
export const openaiCompatibleAdapter = createOpenAIAdapter({
  // Self-hosted and third-party gateways often reject the schema field.
  structuredOutputs: false,
});
