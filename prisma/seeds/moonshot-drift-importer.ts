export type DriftSeedJson = {
  name: string;
  threshold: number;
  prompts: {
    promptText: string;
    expectedBehavior: string;
    referenceOutput?: string;
  }[];
};

export function buildBenchmarkSeed(j: DriftSeedJson) {
  return {
    name: j.name,
    threshold: j.threshold,
    prompts: j.prompts.map((p, i) => ({ sortOrder: i, ...p })),
  };
}
