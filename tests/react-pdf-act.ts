import { afterAll, beforeAll } from "vitest";

const ACT_ENV_KEY = "IS_REACT_ACT_ENVIRONMENT";

export function disableReactActEnvironment(): void {
  let previous: unknown;

  beforeAll(() => {
    const globals = globalThis as Record<string, unknown>;
    previous = globals[ACT_ENV_KEY];
    globals[ACT_ENV_KEY] = false;
  });

  afterAll(() => {
    const globals = globalThis as Record<string, unknown>;
    if (previous === undefined) delete globals[ACT_ENV_KEY];
    else globals[ACT_ENV_KEY] = previous;
  });
}
