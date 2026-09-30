"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PillarQuestion } from "@/components/maturity/PillarQuestion";
import { PILLARS, QUESTIONS, type Pillar } from "@/lib/maturity/pillars";
import { trpc } from "@/lib/trpc/client";
import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { WizardLayout } from "@/components/page/WizardLayout";
import { PageHeader } from "@/components/page/PageHeader";

type Scores = Record<string, Record<string, number>>;

export default function NewAssessmentPage() {
  const t = useTranslations("maturity");
  const router = useRouter();
  const submitMutation = trpc.maturity.submit.useMutation();
  const [scores, setScores] = useState<Scores>({});
  const [step, setStep] = useState(0);

  const handleScoreChange = (pillar: Pillar, qid: string, score: number) => {
    setScores((prev: Scores) => ({
      ...prev,
      [pillar]: { ...(prev[pillar] ?? {}), [qid]: score },
    }));
  };

  const handleSubmit = async () => {
    const scoresByPillar: Record<
      string,
      Array<{ qid: string; score: number }>
    > = {};
    for (const p of PILLARS) {
      const pillarScores = scores[p] ?? {};
      scoresByPillar[p] = Object.entries(pillarScores).map(([qid, score]) => ({
        qid,
        score: score as number,
      }));
    }
    await submitMutation.mutateAsync({ scoresByPillar });
    router.push("/maturity");
  };

  const pillar = PILLARS[step];
  const steps = PILLARS.map(
    (p, i): { label: string; status: "complete" | "current" | "upcoming" } => ({
      label: p,
      status: i < step ? "complete" : i === step ? "current" : "upcoming",
    }),
  );

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("assessmentDesc")}
        breadcrumb={
          <Link href="/maturity" className="text-secondary hover:text-primary">
            {t("title")}
          </Link>
        }
      />
      <WizardLayout
        steps={steps}
        onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
        onNext={
          step < PILLARS.length - 1 ? () => setStep((s) => s + 1) : handleSubmit
        }
        nextLabel={t("next")}
        backLabel={t("back")}
        cancelLabel={t("cancel")}
        isLastStep={step === PILLARS.length - 1}
        submitting={submitMutation.isPending}
      >
        <PillarQuestion
          pillar={pillar}
          questions={QUESTIONS[pillar]}
          onChange={(qid, score) => handleScoreChange(pillar, qid, score)}
        />
      </WizardLayout>
    </>
  );
}
