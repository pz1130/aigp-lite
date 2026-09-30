import { describe, it, expect } from "vitest";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineModule } from "./types";
import { MODULES } from "./registry";
import { Boxes } from "lucide-react";

describe("defineModule", () => {
  it("returns a frozen ModuleConfig with required fields", () => {
    const m = defineModule({
      slug: "demo",
      title: { en: "Demo", zh: "演示" },
      icon: Boxes,
      nav: { order: 99, group: "govern" },
      permissions: [],
    });
    expect(m.slug).toBe("demo");
    expect(Object.isFrozen(m)).toBe(true);
  });

  it("rejects invalid slug", () => {
    expect(() =>
      defineModule({
        slug: "Bad Slug!",
        title: { en: "x", zh: "x" },
        icon: Boxes,
        nav: { order: 1, group: "govern" },
        permissions: [],
      }),
    ).toThrow(/slug/i);
  });
});

describe("registry", () => {
  it("has unique slugs (vacuously true while empty)", () => {
    const slugs = MODULES.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

// Guards against the failure mode where a module ships with a valid
// module.config.ts + route but is never added to the manual MODULES import
// list in registry.ts, so its sidebar link silently never appears. The
// registry is hand-maintained (not glob-discovered), so nothing else catches
// this — a diff-only review won't either.
describe("registry registration guard", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const modulesDir = path.resolve(
    here,
    "../../app/[locale]/(dashboard)/(modules)",
  );

  // module.config.ts files that intentionally exist but are NOT sidebar
  // entries. asi-redteam-checklist is a "card" (rendered on the /redteam
  // page, not the sidebar); its config file is vestigial and imported
  // nowhere. Add a slug here ONLY with a one-line reason — that comment is
  // the reviewable record of a deliberate exclusion.
  const ALLOWED_UNREGISTERED = new Set<string>([
    "asi-redteam-checklist", // card on /redteam, not a sidebar module
  ]);

  // Read the slug straight from each config's source rather than importing
  // it: the on-disk path contains spaces, "[locale]", and "(dashboard)",
  // which break both dynamic import() URL resolution and import.meta.glob
  // patterns. A defineModule call always declares slug + nav literally.
  function discoverModuleSlugs(): string[] {
    const slugs: string[] = [];
    for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const configPath = path.join(modulesDir, entry.name, "module.config.ts");
      if (!existsSync(configPath)) continue;
      const src = readFileSync(configPath, "utf8");
      const slugMatch = src.match(/slug:\s*["'`]([a-z][a-z0-9-]*)["'`]/);
      // A real sidebar-eligible module declares both slug and a nav block.
      if (slugMatch && /\bnav:\s*\{/.test(src)) {
        slugs.push(slugMatch[1]);
      }
    }
    return slugs;
  }

  it("registers every module.config.ts in MODULES (or documents the exception)", () => {
    const registered = new Set(MODULES.map((m) => m.slug));
    const discovered = discoverModuleSlugs();

    const missing = discovered.filter(
      (slug) => !registered.has(slug) && !ALLOWED_UNREGISTERED.has(slug),
    );

    expect(
      missing,
      `Module(s) have a module.config.ts but are not in the MODULES array in ` +
        `registry.ts, so their sidebar link will not appear: ${missing.join(", ")}. ` +
        `Add the import + array entry, or add the slug to ALLOWED_UNREGISTERED ` +
        `with a reason if it is intentionally not a sidebar module.`,
    ).toEqual([]);
  });

  it("keeps ALLOWED_UNREGISTERED free of stale or registered entries", () => {
    const registered = new Set(MODULES.map((m) => m.slug));
    const discovered = new Set(discoverModuleSlugs());

    for (const slug of ALLOWED_UNREGISTERED) {
      // The exception must point at a real, unregistered config — otherwise
      // it is dead weight that masks nothing.
      expect(discovered.has(slug), `${slug} not found on disk`).toBe(true);
      expect(
        registered.has(slug),
        `${slug} is in MODULES; remove it from ALLOWED_UNREGISTERED`,
      ).toBe(false);
    }
  });
});
