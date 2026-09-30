"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { Download } from "lucide-react";

export function GenerateAssessmentPdfButton({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const t = useTranslations("risk");
  const router = useRouter();
  const mutation = trpc.risk.regeneratePdf.useMutation({
    onSuccess: () => router.refresh(),
    onError: (err) => alert(`${t("generateReportError")}\n${err.message}`),
  });

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate({ assessmentId })}
    >
      <Download size={14} className="mr-1" />
      {mutation.isPending ? t("generateReportPending") : t("generateReport")}
    </Button>
  );
}
