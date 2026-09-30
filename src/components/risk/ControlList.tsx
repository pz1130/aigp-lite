"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";

type Status =
  "not_applicable" | "not_started" | "in_progress" | "satisfied" | "failed";

interface Control {
  id: string;
  code: string;
  title: string;
  severity: "low" | "medium" | "high";
}

export interface ControlListFramework {
  id: string;
  code: string;
  name: string;
  controls: Control[];
}

export type ControlStatus = Status;

export interface ControlStatusById {
  [controlId: string]: Status;
}

const severityToVariant = (
  level: string,
): "danger" | "warn" | "success" | "critical" => {
  if (level === "critical") return "critical";
  if (level === "high") return "danger";
  if (level === "medium") return "warn";
  return "success";
};

export function ControlList({
  usecaseId,
  frameworks,
  statusByControl,
}: {
  usecaseId: string;
  frameworks: ControlListFramework[];
  statusByControl: ControlStatusById;
}) {
  const t = useTranslations("risk");
  const router = useRouter();
  const [localStatuses, setLocalStatuses] = useState<ControlStatusById>({});
  const setStatus = trpc.risk.setControlStatus.useMutation({
    onSuccess: () => router.refresh(),
  });

  const merged: ControlStatusById = { ...statusByControl, ...localStatuses };

  return (
    <div className="space-y-6">
      {frameworks.map((fw) => (
        <div
          key={fw.id}
          className="rounded-lg border border-border-default bg-surface p-4"
        >
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-secondary">
            {fw.name}
          </h3>
          <Table>
            <THead>
              <Tr>
                <Th className="w-28">{t("code")}</Th>
                <Th>{t("control")}</Th>
                <Th className="w-28">{t("severityLabel")}</Th>
                <Th className="w-44">{t("status")}</Th>
              </Tr>
            </THead>
            <TBody>
              {fw.controls.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-mono text-xs">{c.code}</Td>
                  <Td className="text-primary">{c.title}</Td>
                  <Td>
                    <Badge size="sm" variant={severityToVariant(c.severity)}>
                      {t(`severity.${c.severity}`)}
                    </Badge>
                  </Td>
                  <Td>
                    <Select
                      value={merged[c.id] ?? "not_started"}
                      onValueChange={(val) => {
                        setLocalStatuses((prev) => ({
                          ...prev,
                          [c.id]: val as Status,
                        }));
                        setStatus.mutate({
                          usecaseId,
                          controlId: c.id,
                          status: val as Status,
                        });
                      }}
                      disabled={setStatus.isPending}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_started">
                          {t("statuses.not_started")}
                        </SelectItem>
                        <SelectItem value="in_progress">
                          {t("statuses.in_progress")}
                        </SelectItem>
                        <SelectItem value="satisfied">
                          {t("statuses.satisfied")}
                        </SelectItem>
                        <SelectItem value="failed">
                          {t("statuses.failed")}
                        </SelectItem>
                        <SelectItem value="not_applicable">
                          {t("statuses.not_applicable")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
