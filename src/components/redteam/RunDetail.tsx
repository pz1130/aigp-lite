"use client";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { Card, CardBody } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface Finding {
  promptRef: string;
  category: string;
  severity: string;
  judgment: string;
  judgmentReason: string;
  promptText?: string;
  response?: string;
  latencyMs?: number;
}

const NONE = "none";

export function RunDetail({ id, canWrite }: { id: string; canWrite: boolean }) {
  const t = useTranslations("redteam");
  const tCommon = useTranslations("common");
  const q = trpc.redteam.runs.get.useQuery({ id });
  const usecases = trpc.inventory.list.useQuery();
  const linkMut = trpc.redteam.runs.linkSystem.useMutation();
  const [linkState, setLinkState] = useState<"idle" | "saved" | "error">(
    "idle",
  );
  const [liveFindings, setLive] = useState<Finding[]>([]);
  const [progress, setProgress] = useState<{
    completed: number;
    passed: number;
    failed: number;
    error: number;
    total?: number;
  } | null>(null);
  const [doneSummary, setDoneSummary] = useState<{
    incidentId?: string;
  } | null>(null);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    if (q.data.status !== "running" && q.data.status !== "pending") return;

    if (q.data.engine !== "builtin") {
      const timer = setInterval(() => q.refetch(), 3000);
      return () => clearInterval(timer);
    }

    const es = new EventSource(`/api/redteam/runs/${id}/stream`);
    es.addEventListener("started", (e) =>
      setProgress((p) => ({
        ...(p ?? { completed: 0, passed: 0, failed: 0, error: 0 }),
        total: JSON.parse((e as MessageEvent).data).totalPrompts,
      })),
    );
    es.addEventListener("finding", (e) =>
      setLive((prev) => [...prev, JSON.parse((e as MessageEvent).data)]),
    );
    es.addEventListener("progress", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setProgress((p) => ({ ...d, total: p?.total }));
    });
    es.addEventListener("done", (e) => {
      setDoneSummary(JSON.parse((e as MessageEvent).data));
      es.close();
      q.refetch();
    });
    es.addEventListener("error", () => es.close());
    return () => es.close();
  }, [q.data?.status, q.data?.engine, id]);

  async function abort() {
    setShowAbortConfirm(true);
  }

  if (q.isLoading || !q.data) return <p>{tCommon("loading")}</p>;
  const ev = q.data;
  const findings = liveFindings.length > 0 ? liveFindings : ev.findings;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-baseline">
        <h2 className="text-xl font-semibold">{ev.model}</h2>
        <span className="font-mono text-xs">{ev.status}</span>
      </div>

      {canWrite && (
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="rt-link-usecase">
            {t("linkSystem.label")}
          </label>
          <div className="flex items-center gap-2">
            <Select
              value={ev.usecaseId ?? NONE}
              onValueChange={(v) => {
                setLinkState("idle");
                linkMut.mutate(
                  { id, usecaseId: v === NONE ? null : v },
                  {
                    onSuccess: () => {
                      setLinkState("saved");
                      q.refetch();
                    },
                    onError: () => setLinkState("error"),
                  },
                );
              }}
            >
              <SelectTrigger
                id="rt-link-usecase"
                aria-label={t("linkSystem.label")}
              >
                <SelectValue placeholder={t("linkSystem.label")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("linkSystem.none")}</SelectItem>
                {(usecases.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {linkState === "saved" && (
              <span className="text-xs text-success">
                {t("linkSystem.saved")}
              </span>
            )}
            {linkState === "error" && (
              <span className="text-xs text-danger">
                {t("linkSystem.error")}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        <ProgressCard
          label={t("run.field.total")}
          value={progress?.total ?? ev.totalPrompts ?? "—"}
        />
        <ProgressCard
          label={t("run.field.passed")}
          value={progress?.passed ?? ev.passedCount ?? 0}
          variant="success"
        />
        <ProgressCard
          label={t("run.field.failed")}
          value={progress?.failed ?? ev.failedCount ?? 0}
          variant="danger"
        />
        <ProgressCard
          label={t("run.field.error")}
          value={progress?.error ?? ev.errorCount ?? 0}
          variant="tertiary"
        />
      </div>

      {(ev.status === "running" || ev.status === "pending") && (
        <Button variant="danger" size="sm" onClick={abort}>
          {t("run.abort")}
        </Button>
      )}

      {doneSummary?.incidentId && (
        <Link
          className="block rounded-md border border-warn bg-warn-subtle p-2 text-sm text-warn"
          href={`/incidents/${doneSummary.incidentId}`}
        >
          → {t("run.viewIncident")}
        </Link>
      )}

      <Table>
        <THead>
          <Tr>
            <Th>{t("finding.promptRef")}</Th>
            <Th>{t("finding.category")}</Th>
            <Th>{t("finding.severity")}</Th>
            <Th>{t("finding.judgment")}</Th>
            <Th>{t("finding.reason")}</Th>
          </Tr>
        </THead>
        <TBody>
          {findings.map((f) => (
            <Tr
              key={f.promptRef + ":" + f.judgment}
              className={
                f.judgment === "fail"
                  ? "bg-danger-subtle"
                  : f.judgment === "error"
                    ? "bg-muted"
                    : ""
              }
            >
              <Td className="font-mono text-xs">{f.promptRef}</Td>
              <Td className="text-xs">{f.category}</Td>
              <Td className="text-xs">{f.severity}</Td>
              <Td className="text-xs">{f.judgment}</Td>
              <Td className="text-xs">{f.judgmentReason}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <ConfirmDialog
        open={showAbortConfirm}
        onOpenChange={setShowAbortConfirm}
        title={t("run.abortConfirm")}
        confirmLabel={t("run.abort")}
        variant="danger"
        onConfirm={async () => {
          setShowAbortConfirm(false);
          await fetch(`/api/redteam/runs/${id}/abort`, { method: "POST" });
          q.refetch();
        }}
      />
    </div>
  );
}

function ProgressCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: string | number;
  variant?: "success" | "danger" | "tertiary";
}) {
  const cls =
    variant === "success"
      ? "text-success"
      : variant === "danger"
        ? "text-danger"
        : variant === "tertiary"
          ? "text-tertiary"
          : "";
  return (
    <Card className="hover:shadow-sm transition-all duration-150">
      <CardBody className="p-2 text-center">
        <div className="text-xs text-tertiary">{label}</div>
        <div className={`text-xl font-semibold ${cls}`}>{value}</div>
      </CardBody>
    </Card>
  );
}
