import { prisma } from "@/lib/db";
import type { IncidentMergeSuggestion } from "@/lib/prisma";
import { cosineSimilarity } from "./cosine";
import { embedText } from "./embed";
import { getOrgAutomationConfig } from "./automation-config";
import { metric } from "./metrics";

function buildEmbeddingText(i: {
  title: string;
  rootCause: string;
  category: string | null;
}): string {
  return [i.title, i.rootCause, i.category ?? ""].filter(Boolean).join("\n");
}

export async function suggestDuplicates(
  incidentId: string,
): Promise<IncidentMergeSuggestion[]> {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
  });
  if (!incident) return [];

  const cfg = await getOrgAutomationConfig(incident.orgId);
  if (!cfg.dedupEnabled) {
    metric("incident.dedup.skipped", { reason: "disabled" });
    return [];
  }

  let vec = (incident.embedding ?? null) as number[] | null;
  if (vec === null) {
    vec = await embedText(incident.orgId, buildEmbeddingText(incident));
    if (vec === null) {
      metric("incident.dedup.skipped", { reason: "no_provider" });
      return [];
    }
    await prisma.incident.update({
      where: { id: incidentId },
      data: { embedding: vec as unknown as object },
    });
  }

  const cutoff = new Date(
    Date.now() - cfg.dedupLookbackDays * 24 * 60 * 60 * 1000,
  );
  const candidates = await prisma.incident.findMany({
    where: {
      orgId: incident.orgId,
      id: { not: incidentId },
      status: { not: "closed" },
      mergedIntoId: null,
      openedAt: { gt: cutoff },
      NOT: { embedding: { equals: null as unknown as object } },
    },
    select: { id: true, embedding: true },
  });

  const scored: Array<{ id: string; similarity: number }> = [];
  for (const c of candidates) {
    const cv = c.embedding as unknown as number[] | null;
    if (!cv || cv.length !== vec.length) continue;
    const sim = cosineSimilarity(vec, cv);
    if (sim >= cfg.dedupSimilarityThreshold)
      scored.push({ id: c.id, similarity: sim });
  }
  if (scored.length === 0)
    metric("incident.dedup.skipped", { reason: "no_candidates" });

  scored.sort((a, b) => b.similarity - a.similarity);
  const top = scored.slice(0, 3);

  const out: IncidentMergeSuggestion[] = [];
  for (const s of top) {
    const row = await prisma.incidentMergeSuggestion.upsert({
      where: {
        incidentId_candidateIncidentId: {
          incidentId,
          candidateIncidentId: s.id,
        },
      },
      create: {
        orgId: incident.orgId,
        incidentId,
        candidateIncidentId: s.id,
        similarity: s.similarity,
      },
      update: { similarity: s.similarity },
    });
    out.push(row);
  }
  if (out.length > 0) metric("incident.dedup.suggested");

  return out;
}
