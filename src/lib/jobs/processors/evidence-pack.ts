import { prisma } from "@/lib/db";
import { buildEvidencePack } from "@/lib/evidence-pack/build";
import type { JobPayloads } from "../types";

export async function processEvidencePackBuild(
  data: JobPayloads["evidencePack.build"],
): Promise<void> {
  const pack = await prisma.evidencePack.findUniqueOrThrow({
    where: { id: data.packId },
  });

  await prisma.evidencePack.update({
    where: { id: data.packId },
    data: { status: "building" },
  });

  try {
    const result = await buildEvidencePack({
      orgId: pack.orgId,
      usecaseId: pack.usecaseId ?? undefined,
      framework: pack.framework ?? undefined,
      userId: pack.createdById,
    });

    const { store } = await import("@/lib/storage");
    const stored = await store(pack.orgId, {
      buffer: result.zip,
      filename: `evidence-pack-${pack.id}.zip`,
      mimeType: "application/zip",
    });

    await prisma.evidencePack.update({
      where: { id: data.packId },
      data: {
        status: "ready",
        storageKey: stored.path,
        packHash: result.packHash,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    await prisma.evidencePack.update({
      where: { id: data.packId },
      data: {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    });
    throw err;
  }
}
