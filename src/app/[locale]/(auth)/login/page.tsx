import { LoginForm } from "@/components/auth/LoginForm";
import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { resolveSsoConfig, resolveProviderConfig } from "@/lib/auth/sso/store";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const t = await getTranslations("auth.login");
  const { org: orgHint } = await searchParams;
  // With an org hint, surface that org's connection; otherwise fall back to the
  // env bootstrap or a sole DB-configured connection (single-tenant deployments).
  const cfg = orgHint
    ? await resolveSsoConfig(orgHint)
    : await resolveProviderConfig();
  return (
    <main>
      <LoginForm
        ssoEnabled={cfg !== null}
        ssoButtonLabel={cfg?.buttonLabel}
        orgHint={orgHint}
      />
      <p className="mt-6 text-center text-sm text-white/70">
        <Link href="/register" className="text-white hover:underline">
          {t("noAccount")}
        </Link>
      </p>
    </main>
  );
}
