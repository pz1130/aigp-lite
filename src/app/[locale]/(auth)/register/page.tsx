import { RegisterForm } from "@/components/auth/RegisterForm";
import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";

export default async function RegisterPage() {
  const t = await getTranslations("auth.register");
  return (
    <main>
      <RegisterForm />
      <p className="mt-6 text-center text-sm text-white/70">
        <Link href="/login" className="text-white hover:underline">
          {t("haveAccount")}
        </Link>
      </p>
    </main>
  );
}
