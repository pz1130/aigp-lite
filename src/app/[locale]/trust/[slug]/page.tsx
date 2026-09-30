import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getPublicView } from "@/lib/trust-center/public";
import { TrustPublicView } from "@/components/trust-center/PublicView";

export const runtime = "nodejs";

export default async function TrustPublicPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;
  const view = await getPublicView(slug);
  if (!view) notFound();

  const t = await getTranslations("trustCenter.public");
  const p = view.publicPayload;
  const publishedAt = view.publishedAt
    ? view.publishedAt.toISOString().slice(0, 10)
    : "—";

  return (
    <TrustPublicView
      displayName={view.displayName}
      contactEmail={view.contactEmail}
      version={view.version}
      publishedAt={view.publishedAt}
      payload={p}
      labels={{
        heading: t("heading"),
        dataAsOf: t("dataAsOf", { date: publishedAt, version: view.version }),
        frameworks: t("frameworks"),
        systems: t("systems"),
        goLivePassed: t("goLivePassed"),
        goLivePending: t("goLivePending"),
        redteam: t("redteam"),
        redteamSummary:
          p.redteam.attestationCount > 0
            ? t("redteamCount", {
                count: p.redteam.attestationCount,
                date: (p.redteam.latestAttestationAt ?? "").slice(0, 10),
              })
            : t("redteamNone"),
        transparency: t("transparency"),
        sbom: t("sbom"),
        sbomStatus: p.sbom.available
          ? t("sbomAvailable", { count: p.sbom.componentCount })
          : t("sbomUnavailable"),
        contact: view.contactEmail
          ? t("contact", { email: view.contactEmail })
          : null,
      }}
    />
  );
}
