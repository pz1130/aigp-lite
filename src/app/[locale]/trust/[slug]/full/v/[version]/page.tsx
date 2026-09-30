import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getConfidentialView } from "@/lib/trust-center/public";
import {
  TRUST_COOKIE_NAME,
  verifyTrustCookie,
} from "@/lib/trust-center/cookie";
import { trustViewRateLimiter } from "@/lib/rate-limit/tokenBucket";
import { TrustConfidentialView } from "@/components/trust-center/ConfidentialView";

export const runtime = "nodejs";

export default async function TrustFullVersionPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string; version: string }>;
}) {
  const { locale, slug, version } = await params;
  const parsed = Number(version);
  if (!Number.isInteger(parsed) || parsed < 1) notFound();

  const jar = await cookies();
  const payload = verifyTrustCookie(jar.get(TRUST_COOKIE_NAME)?.value);
  if (!payload || payload.slug !== slug) notFound();

  if (
    !(
      await trustViewRateLimiter.consumeByKeyAsync(
        `trust-view:${payload.tokenId}`,
      )
    ).allowed
  ) {
    notFound();
  }

  const h = await headers();
  const view = await getConfidentialView({
    slug,
    tokenId: payload.tokenId,
    version: parsed,
    ip: h.get("x-forwarded-for") ?? undefined,
    userAgent: h.get("user-agent") ?? undefined,
  });
  if (!view) notFound();

  const t = await getTranslations("trustCenter.full");
  return (
    <TrustConfidentialView
      slug={slug}
      locale={locale}
      displayName={view.displayName}
      version={view.version}
      versions={view.versions}
      payload={view.confidentialPayload}
      labels={{
        heading: t("heading"),
        notice: t("notice"),
        versions: t("versions"),
        readiness: t("readiness"),
        attestations: t("attestations"),
        download: t("download"),
        sbom: t("sbom"),
        transparency: t("transparency"),
      }}
    />
  );
}
