// @vitest-environment node
// The tRPC router pulls in Prisma, whose Bytes handling breaks under jsdom.
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { appRouter } from "@/lib/trpc/router";
import { getOpenApiDocument } from "./generate";

type Operation = {
  tags?: string[];
  operationId?: string;
  security?: Array<Record<string, unknown>>;
  parameters?: Array<{ name: string; in: string; required?: boolean }>;
  "x-trpc-procedure"?: string;
};

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

const doc = getOpenApiDocument();
const operations = Object.entries(doc.paths).flatMap(([route, item]) =>
  METHODS.filter((m) => m in item).map((method) => ({
    route,
    method,
    op: (item as Record<string, Operation>)[method],
  })),
);
const restOps = operations.filter((o) => !o.op["x-trpc-procedure"]);
const trpcOps = operations.filter((o) => o.op["x-trpc-procedure"]);

describe("getOpenApiDocument", () => {
  it("advertises the 3.0 dialect swagger-ui can parse", () => {
    expect(doc.openapi).toMatch(/^3\.0\./);
    expect(restOps.length).toBeGreaterThan(0);
    expect(trpcOps.length).toBeGreaterThan(0);
  });

  it("declares every tag once and every tag an operation uses", () => {
    const declared = doc.tags.map((t) => t.name);
    expect(new Set(declared).size).toBe(declared.length);
    for (const { op } of operations) {
      for (const tag of op.tags ?? []) expect(declared).toContain(tag);
    }
  });

  it("only references declared security schemes", () => {
    const schemes = Object.keys(doc.components.securitySchemes);
    for (const { op } of operations) {
      for (const req of op.security ?? []) {
        for (const name of Object.keys(req)) expect(schemes).toContain(name);
      }
    }
  });

  it("documents each {template} as a required path parameter, and no others", () => {
    for (const { route, method, op } of operations) {
      const templated = [...route.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const pathParams = (op.parameters ?? []).filter((p) => p.in === "path");
      expect(
        pathParams.map((p) => p.name).sort(),
        `${method.toUpperCase()} ${route}`,
      ).toEqual(templated.sort());
      for (const p of pathParams) expect(p.required).toBe(true);
    }
  });

  it("gives every tRPC operation a unique operationId", () => {
    const ids = trpcOps.map((o) => o.op.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("documented endpoints exist", () => {
  it("maps every REST path to a route handler exporting that method", () => {
    for (const { route, method } of restOps) {
      const dir = route.replace(/^\/api\//, "").replace(/\{(\w+)\}/g, "[$1]");
      const file = path.join(process.cwd(), "src/app/api", dir, "route.ts");
      expect(fs.existsSync(file), `${route} → ${file}`).toBe(true);
      const exportsMethod = new RegExp(
        `export\\s+(async\\s+)?(function|const)\\s+${method.toUpperCase()}\\b`,
      );
      expect(
        fs.readFileSync(file, "utf8"),
        `${method.toUpperCase()} ${route}`,
      ).toMatch(exportsMethod);
    }
  });

  it("maps every tRPC entry to a real procedure of the matching kind", () => {
    // Typed as a nested record, but at runtime it is flat with dotted keys.
    const procedures = appRouter._def.procedures as unknown as Record<
      string,
      { _def: { type: "query" | "mutation" | "subscription" } }
    >;
    for (const { method, op } of trpcOps) {
      const name = op["x-trpc-procedure"]!;
      expect(procedures[name], `procedure ${name}`).toBeDefined();
      const expected = method === "get" ? "query" : "mutation";
      expect(procedures[name]._def.type, `${name} via ${method}`).toBe(
        expected,
      );
    }
  });
});
