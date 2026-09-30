"use client";

import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

export function McpDriftPanel({ serverId }: { serverId: string }) {
  const t = useTranslations("mcp");
  const utils = trpc.useUtils();
  const diff = trpc.mcp.pendingDiff.useQuery({ serverId });
  const snapshots = trpc.mcp.listSnapshots.useQuery({ serverId });
  const approve = trpc.mcp.approveBaseline.useMutation({
    onSuccess: () => {
      void utils.mcp.invalidate();
    },
  });

  if (!diff.data) return null;
  const latestId = snapshots.data?.[0]?.id;

  return (
    <section className="rounded-lg border border-red-300 bg-red-50 p-4">
      <h2 className="font-semibold text-red-900">{t("drift.panelTitle")}</h2>
      <p className="mt-1 text-sm text-red-800">{t("drift.panelIntro")}</p>

      {diff.data.added.length > 0 && (
        <div className="mt-3">
          <h3 className="text-sm font-medium">{t("drift.added")}</h3>
          <ul className="mt-1 list-inside list-disc text-sm">
            {diff.data.added.map((tool) => (
              <li key={tool.name}>
                <code>{tool.name}</code> — {tool.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {diff.data.removed.length > 0 && (
        <div className="mt-3">
          <h3 className="text-sm font-medium">{t("drift.removed")}</h3>
          <ul className="mt-1 list-inside list-disc text-sm">
            {diff.data.removed.map((tool) => (
              <li key={tool.name}>
                <code>{tool.name}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {diff.data.changed.length > 0 && (
        <div className="mt-3">
          <h3 className="text-sm font-medium">{t("drift.changed")}</h3>
          {diff.data.changed.map((c) => (
            <div
              key={c.name}
              className="mt-2 rounded border border-red-200 bg-white p-2 text-sm"
            >
              <code>{c.name}</code>{" "}
              <span className="text-xs text-red-700">
                {[
                  c.descriptionChanged ? t("drift.descriptionChanged") : null,
                  c.inputSchemaChanged ? t("drift.schemaChanged") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {c.descriptionChanged && (
                <dl className="mt-1 grid grid-cols-1 gap-1 md:grid-cols-2">
                  <div>
                    <dt className="text-xs text-neutral-500">
                      {t("drift.before")}
                    </dt>
                    <dd className="whitespace-pre-wrap">
                      {c.before.description}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-500">
                      {t("drift.after")}
                    </dt>
                    <dd className="whitespace-pre-wrap">
                      {c.after.description}
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        disabled={!latestId || approve.isPending}
        onClick={() =>
          latestId && approve.mutate({ serverId, snapshotId: latestId })
        }
        className="mt-4 bg-red-700 hover:bg-red-800"
      >
        {t("drift.approve")}
      </Button>
      {approve.isSuccess && (
        <p className="mt-2 text-sm text-green-700">{t("drift.approved")}</p>
      )}
    </section>
  );
}
