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

export function AsiChkNewClient() {
  const t = useTranslations("asiRedteamChecklist");
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [anchor, setAnchor] = useState<"org" | "usecase">("org");
  const [usecaseId, setUsecaseId] = useState<string>("");

  const usecases = trpc.inventory.list.useQuery();
  const create = trpc.asiRedteamChecklist.create.useMutation({
    onSuccess: (rec) => router.push(`/asi-redteam-checklist/${rec.id}`),
  });

  return (
    <div className="max-w-lg space-y-4">
      <label className="block space-y-1">
        <span className="text-sm">{t("fieldTitle")}</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
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
            <SelectItem value="org">{t("anchorOrg")}</SelectItem>
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
          !title || (anchor === "usecase" && !usecaseId) || create.isPending
        }
        onClick={() =>
          create.mutate({
            title,
            usecaseId: anchor === "usecase" ? usecaseId : null,
          })
        }
      >
        {t("create")}
      </Button>
    </div>
  );
}
