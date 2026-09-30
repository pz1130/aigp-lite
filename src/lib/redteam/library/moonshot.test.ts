import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MOONSHOT_PROMPTS, isMoonshotStaticEnabled } from "./moonshot";
import { CATEGORIES, CHECKER_SLUGS, SEVERITIES } from "../types";

describe("MOONSHOT_PROMPTS", () => {
  it("every entry uses the moonshot. slug prefix (provenance guard)", () => {
    for (const p of MOONSHOT_PROMPTS) {
      expect(p.slug.startsWith("moonshot.")).toBe(true);
    }
  });

  it("every entry has valid category/severity/checker and attribution source", () => {
    for (const p of MOONSHOT_PROMPTS) {
      expect(CATEGORIES).toContain(p.category);
      expect(SEVERITIES).toContain(p.severity);
      expect(CHECKER_SLUGS).toContain(p.checker);
      expect(p.source && p.source.toLowerCase().includes("moonshot")).toBe(
        true,
      );
    }
  });

  it("has no duplicate slugs", () => {
    const seen = new Set<string>();
    for (const p of MOONSHOT_PROMPTS) {
      expect(seen.has(p.slug)).toBe(false);
      seen.add(p.slug);
    }
  });
});

describe("isMoonshotStaticEnabled", () => {
  const KEY = "AIGP_REDTEAM_MOONSHOT_STATIC";
  const ENGINE_KEY = "AIGP_MOONSHOT_URL";
  let prev: string | undefined;
  let prevEngine: string | undefined;
  beforeEach(() => {
    prev = process.env[KEY];
    prevEngine = process.env[ENGINE_KEY];
  });
  afterEach(() => {
    if (prev === undefined) delete process.env[KEY];
    else process.env[KEY] = prev;
    if (prevEngine === undefined) delete process.env[ENGINE_KEY];
    else process.env[ENGINE_KEY] = prevEngine;
  });

  it("defaults to ENABLED when engine is not configured (Phase B)", () => {
    delete process.env[KEY];
    delete process.env[ENGINE_KEY];
    expect(isMoonshotStaticEnabled()).toBe(true);
  });

  it("can be turned off explicitly", () => {
    process.env[KEY] = "false";
    expect(isMoonshotStaticEnabled()).toBe(false);
  });

  it("static set defaults OFF once the engine is enabled (dedup)", () => {
    delete process.env[KEY];
    process.env[ENGINE_KEY] = "http://moonshot:5000";
    expect(isMoonshotStaticEnabled()).toBe(false);
    delete process.env[ENGINE_KEY];
  });

  it("explicit true still forces the static set on (offline fallback)", () => {
    process.env[ENGINE_KEY] = "http://moonshot:5000";
    process.env[KEY] = "true";
    expect(isMoonshotStaticEnabled()).toBe(true);
    delete process.env[ENGINE_KEY];
    delete process.env[KEY];
  });
});
