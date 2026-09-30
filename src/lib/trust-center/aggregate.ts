import fs from "node:fs/promises";
import path from "node:path";
import type { OrgScopedClient } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import {
  aggregateSystemCard,
  type SystemCardData,
} from "@/lib/system-card/aggregator";
import type { ReadinessCheck } from "@/lib/dossier/types";

export interface TrustSbom {
  available: boolean;
  componentCount: number;
  document: unknown | null;
}

export interface TrustPublicPayload {
  org: { displayName: string; intro: string; contactEmail: string | null };
  frameworks: { framework: string; version: string; importedAt: string }[];
  systems: {
    id: string;
    name: string;
    intendedUse: string;
    goLivePassed: boolean;
  }[];
  redteam: { attestationCount: number; latestAttestationAt: string | null };
  transparencyReports: {
    id: string;
    title: string;
    periodLabel: string;
    version: number;
    publishedAt: string | null;
  }[];
  sbom: { available: boolean; componentCount: number };
  generatedAt: string;
}

export interface TrustConfidentialPayload {
  systems: {
    id: string;
    name: string;
    card: Omit<SystemCardData, "openIncidents">;
  }[];
  readiness: { systemId: string; checks: ReadinessCheck[] }[];
  transparencyReports: {
    id: string;
    title: string;
    periodLabel: string;
    version: number;
    publishedAt: string | null;
    sections: unknown;
    snapshot: unknown;
  }[];
  attestations: {
    id: string;
    usecaseId: string;
    attesterName: string;
    attesterOrg: string;
    attesterContact: string;
    scope: string;
    methodology: string;
    attestedAt: string;
    engagementStart: string | null;
    engagementEnd: string | null;
    reportSha256: string;
    reportBytes: number;
    summary: string;
  }[];
  sbom: TrustSbom;
  generatedAt: string;
}

/**
 * `openIncidents` is live, unreviewed, and the most sensitive field in the
 * card. With a single confidential tier there is no audience to hide it
 * behind, so it is dropped from BOTH tiers. If incident posture should ever be
 * disclosed, the vehicle is the incident-trends module, whose reports are
 * already reviewed and published.
 */
export function stripOpenIncidents(
  card: SystemCardData,
): Omit<SystemCardData, "openIncidents"> {
  const { openIncidents: _dropped, ...rest } = card;
  return rest;
}

const GO_LIVE_PASSED = new Set(["approved", "live"]);

function firstLine(text: string): string {
  return (text ?? "").split("\n")[0]!.trim().slice(0, 200);
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/**
 * The CycloneDX SBOM is a build artifact (`npm run sbom:generate`, gitignored),
 * so it may legitimately be absent in dev. Absence is reported, never thrown.
 */
export async function readSbom(): Promise<TrustSbom> {
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), "sbom.json"),
      "utf8",
    );
    const document = JSON.parse(raw) as { components?: unknown[] };
    return {
      available: true,
      componentCount: Array.isArray(document.components)
        ? document.components.length
        : 0,
      document,
    };
  } catch {
    return { available: false, componentCount: 0, document: null };
  }
}

export async function buildTrustPayloads(opts: {
  db: OrgScopedClient;
  orgId: string;
  usecaseIds: string[];
  profile: { displayName: string; intro: string; contactEmail: string | null };
  generatedBy: { id: string; name: string };
}): Promise<{
  publicPayload: TrustPublicPayload;
  confidentialPayload: TrustConfidentialPayload;
}> {
  const { db, orgId, usecaseIds, profile, generatedBy } = opts;
  const generatedAt = new Date().toISOString();

  const cards: { id: string; card: SystemCardData }[] = [];
  for (const usecaseId of usecaseIds) {
    const card = await aggregateSystemCard({
      db,
      orgId,
      usecaseId,
      generatedBy,
    });
    if (card) cards.push({ id: usecaseId, card });
  }

  const [frameworks, txrs, attestations, sbom] = await Promise.all([
    prisma.frameworkVersion.findMany({ orderBy: { framework: "asc" } }),
    db.txrReport.findMany({
      where: { orgId, status: "published" },
      orderBy: { publishedAt: "desc" },
    }),
    db.redteamAttestation.findMany({
      where: { orgId, usecaseId: { in: usecaseIds } },
      orderBy: { attestedAt: "desc" },
    }),
    readSbom(),
  ]);

  // Public redteam is count+date only. DB is complete; cards fill an empty query.
  const cardAttestations = cards.flatMap(
    ({ card }) => card.externalAttestations,
  );
  const latestCardAttestedAt = cardAttestations.reduce<Date | null>(
    (latest, a) => (!latest || a.attestedAt > latest ? a.attestedAt : latest),
    null,
  );
  const cardAttestationCount = cards.reduce(
    (n, { card }) =>
      n +
      Math.max(
        card.externalAttestations.length,
        card.snapshot.externalRedteam.attestationCount,
      ),
    0,
  );

  // Published org TXRs first; card-only reports (no periodLabel) fill missing ids.
  const publicTxrById = new Map<
    string,
    TrustPublicPayload["transparencyReports"][number]
  >();
  for (const t of txrs) {
    publicTxrById.set(t.id, {
      id: t.id,
      title: t.title,
      periodLabel: t.periodLabel,
      version: t.version,
      publishedAt: iso(t.publishedAt),
    });
  }
  for (const { card } of cards) {
    for (const t of card.transparencyReports) {
      if (publicTxrById.has(t.id)) continue;
      publicTxrById.set(t.id, {
        id: t.id,
        title: t.title,
        periodLabel: "",
        version: t.version,
        publishedAt: iso(t.publishedAt),
      });
    }
  }

  const publicPayload: TrustPublicPayload = {
    org: {
      displayName: profile.displayName,
      intro: profile.intro,
      contactEmail: profile.contactEmail,
    },
    frameworks: frameworks.map((f) => ({
      framework: f.framework,
      version: f.version,
      importedAt: f.importedAt.toISOString(),
    })),
    systems: cards.map(({ id, card }) => ({
      id,
      name: card.snapshot.system.name,
      intendedUse: firstLine(card.intendedUse),
      goLivePassed: GO_LIVE_PASSED.has(card.snapshot.goLive?.status ?? ""),
    })),
    redteam: {
      attestationCount: Math.max(attestations.length, cardAttestationCount),
      latestAttestationAt: iso(
        attestations[0]?.attestedAt ?? latestCardAttestedAt,
      ),
    },
    transparencyReports: [...publicTxrById.values()],
    sbom: { available: sbom.available, componentCount: sbom.componentCount },
    generatedAt,
  };

  const confidentialPayload: TrustConfidentialPayload = {
    systems: cards.map(({ id, card }) => ({
      id,
      name: card.snapshot.system.name,
      card: stripOpenIncidents(card),
    })),
    readiness: cards.map(({ id, card }) => ({
      systemId: id,
      checks: card.readiness.checks,
    })),
    transparencyReports: txrs.map((t) => ({
      id: t.id,
      title: t.title,
      periodLabel: t.periodLabel,
      version: t.version,
      publishedAt: iso(t.publishedAt),
      sections: t.sections,
      snapshot: t.snapshot,
    })),
    attestations: attestations.map((a) => ({
      id: a.id,
      usecaseId: a.usecaseId,
      attesterName: a.attesterName,
      attesterOrg: a.attesterOrg,
      attesterContact: a.attesterContact,
      scope: a.scope,
      methodology: a.methodology,
      attestedAt: a.attestedAt.toISOString(),
      engagementStart: iso(a.engagementStart),
      engagementEnd: iso(a.engagementEnd),
      reportSha256: a.reportSha256,
      reportBytes: a.reportBytes,
      summary: a.summary,
    })),
    sbom,
    generatedAt,
  };

  return { publicPayload, confidentialPayload };
}
