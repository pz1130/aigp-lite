import { PRICES, lookupPrice } from "./prices";

describe("PRICES catalog", () => {
  test("has at least 20 model entries across all provider types", () => {
    const total = Object.values(PRICES).reduce(
      (sum, models) => sum + Object.keys(models).length,
      0,
    );
    expect(total).toBeGreaterThanOrEqual(20);
  });

  test("lookupPrice returns entry for gpt-4o-mini with valid input/output", () => {
    const price = lookupPrice("openai", "gpt-4o-mini");
    expect(price).toBeDefined();
    expect(price!.inputPerMillion).toBeGreaterThan(0);
    expect(price!.outputPerMillion).toBeGreaterThanOrEqual(
      price!.inputPerMillion,
    );
  });

  test("lookupPrice returns undefined for unknown model", () => {
    const price = lookupPrice("openai", "unknown-model-xyz");
    expect(price).toBeUndefined();
  });

  test("all entries have outputPerMillion >= inputPerMillion", () => {
    const failures: string[] = [];
    for (const [provider, models] of Object.entries(PRICES)) {
      for (const [model, price] of Object.entries(models)) {
        if (price.outputPerMillion < price.inputPerMillion) {
          failures.push(
            `${provider}/${model}: output=${price.outputPerMillion} < input=${price.inputPerMillion}`,
          );
        }
      }
    }
    expect(failures).toHaveLength(0);
  });
});
