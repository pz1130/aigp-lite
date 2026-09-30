"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function AuditIntegrityPanel() {
  const t = useTranslations("audit.integrity");
  const statsQ = trpc.audit.chainStats.useQuery();
  const verify = trpc.audit.verifyChain.useMutation();
  const [fromSeq, setFromSeq] = useState<string>("");
  const [toSeq, setToSeq] = useState<string>("");

  const onVerify = (opts: { range: "all" | "last1000" | "custom" }) => {
    let payload: { fromSeq?: number; toSeq?: number } | undefined;
    const last = statsQ.data?.lastSeq ?? 0;
    if (opts.range === "last1000" && last > 0) {
      payload = { fromSeq: Math.max(1, last - 999), toSeq: last };
    } else if (opts.range === "custom") {
      payload = {
        fromSeq: fromSeq ? Number(fromSeq) : undefined,
        toSeq: toSeq ? Number(toSeq) : undefined,
      };
    }
    verify.mutate(payload);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <section className="rounded-md border border-border-default p-4">
        <h3 className="font-medium mb-3">{t("statsTitle")}</h3>
        {statsQ.isLoading && (
          <p className="text-sm text-tertiary">{t("loading")}</p>
        )}
        {statsQ.data && (
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-tertiary">{t("totalRows")}</dt>
            <dd>{statsQ.data.totalRows.toLocaleString()}</dd>
            <dt className="text-tertiary">{t("firstSeq")}</dt>
            <dd>{statsQ.data.firstSeq ?? "—"}</dd>
            <dt className="text-tertiary">{t("lastSeq")}</dt>
            <dd>{statsQ.data.lastSeq ?? "—"}</dd>
            <dt className="text-tertiary">{t("lastTs")}</dt>
            <dd>
              {statsQ.data.lastTs
                ? new Date(statsQ.data.lastTs).toLocaleString()
                : "—"}
            </dd>
            <dt className="text-tertiary">{t("lastHash")}</dt>
            <dd className="font-mono text-xs break-all">
              {statsQ.data.lastSelfHash ?? "—"}
            </dd>
          </dl>
        )}
      </section>

      <section className="rounded-md border border-border-default p-4 space-y-3">
        <h3 className="font-medium">{t("verifyTitle")}</h3>
        <p className="text-sm text-tertiary">{t("verifyHelp")}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => onVerify({ range: "last1000" })}
            disabled={verify.isPending}
          >
            {t("verifyLast1000")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => onVerify({ range: "all" })}
            disabled={verify.isPending}
          >
            {t("verifyAll")}
          </Button>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-secondary">
            {t("customRange")}
          </summary>
          <div className="mt-3 flex items-center gap-2">
            <Input
              type="number"
              placeholder="fromSeq"
              value={fromSeq}
              aria-label="fromSeq"
              onChange={(e) => setFromSeq(e.target.value)}
              className="w-32"
            />
            <Input
              type="number"
              placeholder="toSeq"
              value={toSeq}
              aria-label="toSeq"
              onChange={(e) => setToSeq(e.target.value)}
              className="w-32"
            />
            <Button
              onClick={() => onVerify({ range: "custom" })}
              disabled={verify.isPending}
            >
              {t("verifyCustom")}
            </Button>
          </div>
        </details>
      </section>

      {verify.isPending && (
        <p className="text-sm text-secondary">{t("verifying")}</p>
      )}
      {verify.data && (
        <section className="rounded-md border border-border-default p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{t("resultTitle")}</h3>
            <Badge variant={verify.data.ok ? "success" : "danger"}>
              {verify.data.ok ? t("resultOk") : t("resultBad")}
            </Badge>
          </div>
          <p className="text-sm">
            {t("totalChecked", { count: verify.data.totalChecked })}
          </p>
          {!verify.data.ok && (
            <div className="text-sm space-y-1 text-red-500">
              <p>
                {t("firstBadAt", {
                  seq: verify.data.firstBadSeq,
                  kind: verify.data.firstBadKind,
                })}
              </p>
              <p className="font-mono text-xs">{verify.data.detail}</p>
            </div>
          )}
        </section>
      )}
      {verify.error && (
        <p className="text-sm text-red-500">{verify.error.message}</p>
      )}
    </div>
  );
}
