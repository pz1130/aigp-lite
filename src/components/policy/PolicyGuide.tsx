"use client";
import { useState, type ReactNode } from "react";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import {
  ShieldPlus,
  Key,
  FlaskConical,
  ClipboardList,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function PolicyPageShell({ children }: { children: ReactNode }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const t = useTranslations("policy.guide");

  return (
    <>
      <div className="mb-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setGuideOpen((v) => !v)}
        >
          <HelpCircle size={14} className="mr-1" />
          {guideOpen ? t("skip") : t("openGuide")}
        </Button>
      </div>
      {guideOpen && <PolicyGuide onClose={() => setGuideOpen(false)} />}
      {children}
    </>
  );
}

const STEPS = [
  { icon: ShieldPlus, href: "/policy/new" },
  { icon: Key, href: "/policy/api-keys" },
  { icon: FlaskConical, href: "/policy/playground" },
  { icon: ClipboardList, href: "/policy/evaluations" },
] as const;

export function PolicyGuide({ onClose }: { onClose: () => void }) {
  const t = useTranslations("policy.guide");
  const [step, setStep] = useState(0);

  const current = STEPS[step];
  const Icon = current.icon;
  const stepNum = step + 1;

  return (
    <div className="rounded-xl border border-accent/20 bg-accent-subtle p-6 space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-primary">{t("title")}</h2>
        <p className="mt-1 text-sm text-secondary">{t("description")}</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              onClick={() => setStep(i)}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors cursor-pointer ${
                i === step
                  ? "bg-accent text-white shadow-sm"
                  : i < step
                    ? "bg-accent/20 text-accent"
                    : "bg-muted text-tertiary"
              }`}
            >
              {i < step ? "✓" : i + 1}
            </button>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px w-8 ${i < step ? "bg-accent/30" : "bg-border-default"}`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="flex items-start gap-4 rounded-lg border border-border-default bg-surface p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
          <Icon size={20} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-primary">
            {t(`step${stepNum}.title`)}
          </h3>
          <p className="mt-1.5 text-sm text-secondary leading-relaxed">
            {t(`step${stepNum}.description`)}
          </p>
          <Link
            href={current.href}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            {t("goTo")} {t(`step${stepNum}.title`)} →
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t("skip")}
        </Button>
        <div className="flex items-center gap-2">
          {step > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStep((s) => s - 1)}
            >
              {t("back")}
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button size="sm" onClick={() => setStep((s) => s + 1)}>
              {t("next")}
            </Button>
          ) : (
            <Button size="sm" onClick={onClose}>
              {t("finish")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
