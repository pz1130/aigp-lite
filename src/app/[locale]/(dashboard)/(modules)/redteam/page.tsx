import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  ShieldAlert,
  BookOpen,
  FileText,
  ListChecks,
  ArrowRight,
} from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { Card, CardBody } from "@/components/ui/card";

const CATEGORIES = [
  "jailbreak",
  "prompt_injection",
  "bias",
  "harmful",
  "pii_leak",
  "toxicity",
] as const;
const STEPS = [1, 2, 3] as const;
const ENTRIES = [
  { href: "/redteam/runs", icon: ShieldAlert, key: "runs" },
  { href: "/redteam/library", icon: BookOpen, key: "library" },
  { href: "/redteam/model-cards", icon: FileText, key: "modelCards" },
  { href: "/asi-redteam-checklist", icon: ListChecks, key: "checklist" },
] as const;

export default async function RedteamPage() {
  await requireSession();
  const t = await getTranslations("redteam");

  return (
    <>
      <PageHeader title={t("title")} description={t("overview.subtitle")} />

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-primary">
          {t("overview.whatItTests")}
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CATEGORIES.map((c) => (
            <div
              key={c}
              className="rounded-md border border-border-default/60 bg-app/40 px-3 py-2"
            >
              <div className="text-[13px] font-medium text-primary">
                {t(`category.${c}`)}
              </div>
              <div className="mt-0.5 text-[11px] text-secondary/70">
                {t(`overview.categories.${c}`)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-primary">
          {t("overview.howToUse")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s}
              className="rounded-md border border-border-default/60 p-4"
            >
              <div className="text-[13px] font-semibold text-primary">
                {t(`overview.step${s}Title`)}
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-secondary/80">
                {t(`overview.step${s}Body`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="grid gap-3 sm:grid-cols-3">
          {ENTRIES.map(({ href, icon: IconCmp, key }) => (
            <Link key={key} href={href as never} className="group">
              <Card className="h-full">
                <CardBody className="flex flex-col gap-2">
                  <IconCmp size={18} className="text-accent" />
                  <div className="flex items-center gap-1 text-[14px] font-semibold text-primary">
                    {t(`overview.enter.${key}`)}
                    <ArrowRight
                      size={13}
                      className="-translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                    />
                  </div>
                  <p className="text-[12px] leading-relaxed text-secondary/70">
                    {t(`overview.enter.${key}Desc`)}
                  </p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
