import { createAnthropicAdapter } from "./anthropic";
export const anthropicCompatibleAdapter = createAnthropicAdapter({
  // Self-hosted and third-party gateways often reject the schema field.
  structuredOutputs: false,
});
