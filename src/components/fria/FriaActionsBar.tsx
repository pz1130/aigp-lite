"use client";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

type Status = "draft" | "submitted" | "approved" | "archived";
type Role = "admin" | "risk_officer" | "ai_owner" | "auditor" | "viewer";

export function FriaActionsBar({
  friaId,
  status,
  userRole,
  isCreator,
  onAnyAction,
}: {
  friaId: string;
  status: Status;
  userRole: Role;
  isCreator: boolean;
  onAnyAction: () => void;
}) {
  const t = useTranslations("fria");
  const submit = trpc.fria.submit.useMutation({ onSuccess: onAnyAction });
  const withdraw = trpc.fria.withdraw.useMutation({ onSuccess: onAnyAction });
  const approve = trpc.fria.approve.useMutation({ onSuccess: onAnyAction });
  const supersede = trpc.fria.supersede.useMutation({ onSuccess: onAnyAction });
  const archive = trpc.fria.archive.useMutation({ onSuccess: onAnyAction });

  const canApprove =
    (userRole === "admin" || userRole === "risk_officer") && !isCreator;
  const exportPdf = () => window.open(`/api/fria/${friaId}/pdf`, "_blank");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" && (
        <>
          <Button
            onClick={() => submit.mutate({ id: friaId })}
            disabled={submit.isPending}
          >
            {t("actions.submit")}
          </Button>
        </>
      )}
      {status === "submitted" && (
        <>
          {isCreator && (
            <Button
              variant="secondary"
              onClick={() => withdraw.mutate({ id: friaId })}
              disabled={withdraw.isPending}
            >
              {t("actions.withdraw")}
            </Button>
          )}
          {(userRole === "admin" || userRole === "risk_officer") && (
            <>
              <Button
                onClick={() => approve.mutate({ id: friaId })}
                disabled={!canApprove || approve.isPending}
              >
                {t("actions.approve")}
              </Button>
              {!canApprove && (
                <span className="text-xs text-tertiary">
                  {t("selfApproveBlocked")}
                </span>
              )}
            </>
          )}
        </>
      )}
      {status === "approved" && (
        <>
          <Button
            onClick={() => supersede.mutate({ id: friaId })}
            disabled={supersede.isPending}
          >
            {t("actions.supersede")}
          </Button>
          {(userRole === "admin" || userRole === "risk_officer") && (
            <Button
              variant="secondary"
              onClick={() => archive.mutate({ id: friaId })}
              disabled={archive.isPending}
            >
              {t("actions.archive")}
            </Button>
          )}
        </>
      )}
      <Button variant="secondary" onClick={exportPdf}>
        {t("actions.exportPdf")}
      </Button>
    </div>
  );
}
