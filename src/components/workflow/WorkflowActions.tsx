"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Step {
  stepIndex: number;
  stepName: string;
  assigneeRole: string | null;
  assigneeUserId: string | null;
  decision: string;
}

interface WorkflowActionsProps {
  instanceId: string;
  currentStep: Step;
  userId: string;
  userRole: string;
}

export function WorkflowActions({
  instanceId,
  currentStep,
  userId,
  userRole,
}: WorkflowActionsProps) {
  const t = useTranslations("workflow");
  const router = useRouter();
  const [comment, setComment] = useState("");
  const canDecide =
    userRole === "admin" ||
    (currentStep.assigneeUserId != null &&
      currentStep.assigneeUserId === userId) ||
    (currentStep.assigneeRole != null && currentStep.assigneeRole === userRole);

  const decide = trpc.workflow.decideStep.useMutation({
    onSuccess: () => {
      setComment("");
      router.refresh();
    },
  });

  return (
    <div className="rounded-lg border border-accent/30 bg-accent-subtle/30 p-4">
      <h3 className="mb-3 text-small font-semibold uppercase tracking-wider text-accent">
        {t("takeAction")}
      </h3>
      <Textarea
        className="mb-3"
        rows={3}
        placeholder={t("commentPlaceholder")}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() =>
            decide.mutate({
              instanceId,
              stepIndex: currentStep.stepIndex,
              decision: "approved",
              comment,
            })
          }
          disabled={!canDecide || decide.isPending}
        >
          {decide.isPending ? t("processing") : t("action.approve")}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() =>
            decide.mutate({
              instanceId,
              stepIndex: currentStep.stepIndex,
              decision: "rejected",
              comment,
            })
          }
          disabled={!canDecide || decide.isPending}
        >
          {decide.isPending ? t("processing") : t("action.reject")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            decide.mutate({
              instanceId,
              stepIndex: currentStep.stepIndex,
              decision: "requested_changes",
              comment,
            })
          }
          disabled={!canDecide || decide.isPending}
        >
          {decide.isPending ? t("processing") : t("action.requestChanges")}
        </Button>
      </div>
      {!canDecide && (
        <p className="mt-2 text-xs text-secondary">
          {t("notAssignable")}:{" "}
          {currentStep.assigneeRole?.replace(/_/g, " ") ?? "—"}
        </p>
      )}
      {decide.isError && (
        <p className="mt-2 text-small text-danger">{t("decisionError")}</p>
      )}
    </div>
  );
}
