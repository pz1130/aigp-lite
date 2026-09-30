"use client";

import { useTranslations, useFormatter } from "next-intl";
import { trpc } from "@/lib/trpc/client";

export function McpSnapshotHistory({ serverId }: { serverId: string }) {
  const t = useTranslations("mcp");
  const format = useFormatter();
  const snapshots = trpc.mcp.listSnapshots.useQuery({ serverId });
  if (!snapshots.data?.length) return null;
  return (
    <section>
      <h2 className="font-semibold">{t("drift.historyTitle")}</h2>
      <table className="mt-2 w-full text-sm">
        <tbody>
          {snapshots.data.map((s) => (
            <tr key={s.id} className="border-t border-border-default">
              <td className="py-1 font-mono text-xs">
                {s.toolsHash.slice(0, 12)}…
              </td>
              <td>{t(`drift.historySource.${s.source}`)}</td>
              <td>{s.capturedBy?.name ?? s.capturedBy?.email ?? "—"}</td>
              <td>
                {format.dateTime(s.createdAt, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
