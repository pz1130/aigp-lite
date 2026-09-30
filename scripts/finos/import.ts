#!/usr/bin/env tsx
// Prisma 7 no longer auto-loads .env; load it explicitly for tsx/vitest entry points.
import "dotenv/config";
/**
 * FINOS AIGF importer — fetches upstream markdown and writes
 * prisma/seeds/finos-aigf.json. Developer-driven; do not call from CI.
 *
 * Usage:
 *   npm run finos:import
 *   npm run finos:import -- --ref=v1.0.0
 *   npm run finos:import -- --dry-run
 */
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import {
  parseRiskMarkdown,
  parseMitigationMarkdown,
  type FinosRisk,
  type FinosMitigation,
} from "./parse";

const REPO = "finos/ai-governance-framework";
const OUT_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "prisma",
  "seeds",
  "finos-aigf.json",
);
const LICENSE_PATH = `${OUT_PATH}.LICENSE`;
const IMPORTER_VERSION = 1;

type CliFlags = { ref: string; dryRun: boolean; token?: string };

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    ref: "main",
    dryRun: false,
    token: process.env.GITHUB_TOKEN,
  };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--ref=")) flags.ref = a.slice("--ref=".length);
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a.startsWith("--github-token="))
      flags.token = a.slice("--github-token=".length);
  }
  return flags;
}

async function gh<T>(url: string, token?: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "aigp-lite-finos-importer",
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} ${res.statusText} for ${url}`);
  }
  return (await res.json()) as T;
}

async function ghRaw(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Raw fetch ${res.status} for ${url}`);
  return res.text();
}

async function resolveSha(ref: string, token?: string): Promise<string> {
  const data = await gh<{ sha: string }>(
    `https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(ref)}`,
    token,
  );
  return data.sha;
}

type ContentEntry = {
  name: string;
  download_url: string;
  type: "file" | "dir";
};

async function listDir(
  sha: string,
  dir: string,
  token?: string,
): Promise<ContentEntry[]> {
  const all = await gh<ContentEntry[]>(
    `https://api.github.com/repos/${REPO}/contents/${dir}?ref=${sha}`,
    token,
  );
  return all.filter((e) => e.type === "file" && e.name.endsWith(".md"));
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv);
  console.log(`[finos] resolving ref ${flags.ref}...`);
  const sha = await resolveSha(flags.ref, flags.token);
  console.log(`[finos] commit ${sha}`);

  const [riskFiles, mitigationFiles] = await Promise.all([
    listDir(sha, "docs/_risks", flags.token),
    listDir(sha, "docs/_mitigations", flags.token),
  ]);
  console.log(
    `[finos] ${riskFiles.length} risks + ${mitigationFiles.length} mitigations`,
  );

  const risks: FinosRisk[] = [];
  for (const f of riskFiles) {
    const md = await ghRaw(f.download_url);
    risks.push(parseRiskMarkdown(md, f.name, sha));
  }
  const mitigations: FinosMitigation[] = [];
  for (const f of mitigationFiles) {
    const md = await ghRaw(f.download_url);
    mitigations.push(parseMitigationMarkdown(md, f.name, sha));
  }

  risks.sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true }),
  );
  mitigations.sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true }),
  );

  const out = {
    _meta: {
      license: "CC BY 4.0",
      attribution: `Source: FINOS AI Governance Framework (https://github.com/${REPO})`,
      upstreamRef: sha,
      fetchedAt: new Date().toISOString(),
      importerVersion: IMPORTER_VERSION,
    },
    risks,
    mitigations,
  };

  // License file (refresh whenever we re-import)
  const licenseText = await ghRaw(
    `https://raw.githubusercontent.com/${REPO}/${sha}/LICENSE`,
  ).catch(() => `(LICENSE file not found at upstream commit ${sha})`);
  const licenseHeader =
    `${out._meta.attribution}\n` +
    `Upstream commit: ${sha}\n` +
    `Fetched at: ${out._meta.fetchedAt}\n` +
    `\n---\n\n`;

  if (flags.dryRun) {
    console.log("[finos] --dry-run: would write", OUT_PATH);
    const existing = await readFile(OUT_PATH, "utf8").catch(() => "");
    const next = JSON.stringify(out, null, 2);
    if (existing === next) console.log("[finos] no diff");
    else
      console.log(
        `[finos] diff: ${Math.abs(existing.length - next.length)} byte delta`,
      );
    return;
  }

  await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
  await writeFile(LICENSE_PATH, licenseHeader + licenseText, "utf8");
  console.log(`[finos] wrote ${OUT_PATH}`);
  console.log(`[finos] wrote ${LICENSE_PATH}`);
}

main().catch((err) => {
  console.error("[finos] importer failed:", err);
  process.exit(1);
});
