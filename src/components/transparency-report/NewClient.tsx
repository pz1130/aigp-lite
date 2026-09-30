"use client";
import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function TxrNewClient() {
  const t = useTranslations("transparencyReport");
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [periodLabel, setPeriodLabel] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [anchor, setAnchor] = useState<"org" | "usecase">("org");
  const [usecaseId, setUsecaseId] = useState("");

  const usecases = trpc.inventory.list.useQuery();
  const create = trpc.transparencyReport.create.useMutation({
    onSuccess: (rec) => router.push(`/transparency-report/${rec.id}`),
  });

  return (
    <div className="max-w-lg space-y-4">
      <label className="block space-y-1">
        <span className="text-sm">{t("fieldTitle")}</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">{t("periodLabel")}</span>
        <Input
          value={periodLabel}
          onChange={(e) => setPeriodLabel(e.target.value)}
          placeholder="2026 H1"
        />
      </label>
      <div className="flex gap-3">
        <label className="block flex-1 space-y-1">
          <span className="text-sm">{t("periodStart")}</span>
          <Input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          />
        </label>
        <label className="block flex-1 space-y-1">
          <span className="text-sm">{t("periodEnd")}</span>
          <Input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-sm">{t("anchor")}</span>
        <Select
          value={anchor}
          onValueChange={(v) => setAnchor(v as "org" | "usecase")}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="org">{t("scope.organization")}</SelectItem>
            <SelectItem value="usecase">{t("anchorUsecase")}</SelectItem>
          </SelectContent>
        </Select>
      </label>
      {anchor === "usecase" && (
        <label className="block space-y-1">
          <span className="text-sm">{t("selectUsecase")}</span>
          <Select value={usecaseId} onValueChange={setUsecaseId}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(usecases.data ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      )}
      <Button
        disabled={
          !title ||
          !periodLabel ||
          !periodStart ||
          !periodEnd ||
          (anchor === "usecase" && !usecaseId) ||
          create.isPending
        }
        onClick={() =>
          create.mutate({
            title,
            periodLabel,
            periodStart,
            periodEnd,
            usecaseId: anchor === "usecase" ? usecaseId : null,
          })
        }
      >
        {t("create")}
      </Button>
    </div>
  );
}
