import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Capture platform fetch before any test stubs it. With singleThread + isolate,
// vi.stubGlobal("fetch", …) in one file leaks into later files because vi only
// tracks stubs through its own per-file instance — the underlying globalThis
// mutation persists. Yoga-wasm in the pdf renderer then loads via the stub
// and crashes with "Cannot read properties of undefined (reading 'then')".
const originalFetch = globalThis.fetch;

afterEach(() => {
  // jsdom + singleThread shares one document across tests in the same file.
  // Without explicit cleanup, multiple render() calls leave previous trees
  // mounted, causing "Found multiple elements with role X" failures.
  cleanup();
  globalThis.fetch = originalFetch;
});
