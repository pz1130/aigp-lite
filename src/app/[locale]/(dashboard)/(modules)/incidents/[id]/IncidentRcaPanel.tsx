"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";

export function IncidentRcaPanel({
  incidentId,
  canWrite,
}: {
  incidentId: string;
  canWrite: boolean;
}) {
  const t = useTranslations("incidentRca");
  const utils = trpc.useUtils();
  const isEnabled = trpc.incidentRca.isEnabled.useQuery();
  const latest = trpc.incidentRca.latest.useQuery({ incidentId });
  const suggest = trpc.incidentRca.suggest.useMutation({
    onSuccess: () => utils.incidentRca.latest.invalidate({ incidentId }),
  });
  const accept = trpc.incidentRca.accept.useMutation({
    onSuccess: () => utils.incidentRca.latest.invalidate({ incidentId }),
  });
  const reject = trpc.incidentRca.reject.useMutation({
    onSuccess: () => utils.incidentRca.latest.invalidate({ incidentId }),
  });
  const [error, setError] = useState<string | null>(null);

  if (!isEnabled.data?.enabled) return null;

  const d = latest.data;
  const timeline =
    (d?.timeline as Array<{ at: string; event: string; source: string }>) ?? [];
  const recs =
    (d?.recommendations as Array<{
      title: string;
      detail: string;
      priority: "low" | "medium" | "high";
    }>) ?? [];
  const accepted = d?.acceptedAt !== null && d?.acceptedAt !== undefined;

  return (
    <Card>
      <CardBody className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          {canWrite && (
            <Button
              onClick={async () => {
                setError(null);
                try {
                  await suggest.mutateAsync({ incidentId });
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
              disabled={suggest.isPending}
            >
              {suggest.isPending
                ? t("running")
                : d
                  ? t("rerun")
                  : t("suggestButton")}
            </Button>
          )}
        </header>
        <p className="text-sm text-secondary">{t("intro")}</p>

        {d && (
          <div className="space-y-3">
            <div className="text-xs text-tertiary">
              {t("lastRun")}: {new Date(d.requestedAt).toLocaleString()} ·{" "}
              {t("tokens", {
                input: d.inputTokens,
                output: d.outputTokens,
                ms: d.latencyMs,
                model: d.model,
              })}
              <Badge variant="neutral" className="ml-2">
                {d.status}
              </Badge>
            </div>

            {(d.diagnostics as Array<{ code: string; message: string }>)
              ?.length > 0 && (
              <details className="text-xs">
                <summary>{t("diagnostics")}</summary>
                <ul className="ml-4 list-disc">
                  {(
                    d.diagnostics as Array<{ code: string; message: string }>
                  ).map((x, i) => (
                    <li key={i}>
                      <code>{x.code}</code>: {x.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <section>
              <h3 className="font-medium">{t("summary")}</h3>
              <p className="text-sm whitespace-pre-wrap">{d.summary}</p>
            </section>

            <section>
              <h3 className="font-medium">{t("rootCause")}</h3>
              <p className="text-sm whitespace-pre-wrap">{d.rootCause}</p>
            </section>

            <section>
              <h3 className="font-medium">
                {t("timeline")} ({timeline.length})
              </h3>
              {timeline.length === 0 ? (
                <p className="text-sm text-tertiary">{t("noTimeline")}</p>
              ) : (
                <ul className="text-sm">
                  {timeline.map((e, i) => (
                    <li key={i}>
                      · {e.at} <code className="text-xs">[{e.source}]</code>{" "}
                      {e.event}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="font-medium">
                {t("recommendations")} ({recs.length})
              </h3>
              <ul className="space-y-2">
                {recs.map((r, i) => (
                  <li key={i} className="border rounded p-2">
                    <Badge
                      variant={
                        r.priority === "high"
                          ? "danger"
                          : r.priority === "medium"
                            ? "warn"
                            : "info"
                      }
                    >
                      {t(`priority.${r.priority}`)}
                    </Badge>
                    <span className="ml-2 font-medium">{r.title}</span>
                    <p className="text-xs mt-1">{r.detail}</p>
                  </li>
                ))}
              </ul>
            </section>

            {canWrite && !accepted && (
              <div className="flex gap-2 pt-2">
                <Button onClick={() => accept.mutateAsync({ draftId: d.id })}>
                  {t("accept")}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => reject.mutateAsync({ draftId: d.id })}
                >
                  {t("reject")}
                </Button>
              </div>
            )}
            {accepted && (
              <p className="text-xs text-tertiary">
                {t("alreadyAccepted", {
                  who: d.acceptedById ?? "user",
                  when: d.acceptedAt
                    ? new Date(d.acceptedAt).toLocaleString()
                    : "",
                })}
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardBody>
    </Card>
  );
}
