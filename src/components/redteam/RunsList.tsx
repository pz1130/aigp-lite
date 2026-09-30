"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { AgentTestingHint } from "@/components/governance/AgentTestingHint";

export function RunsList() {
  const t = useTranslations();
  const q = trpc.redteam.runs.list.useQuery({ limit: 50 });
  if (q.isLoading) return <p>{t("common.loading")}</p>;
  const rows = q.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link href="/redteam/runs/new">
          <Button variant="primary" size="sm">
            {t("redteam.run.new")}
          </Button>
        </Link>
      </div>
      {rows.length === 0 ? (
        <AgentTestingHint layer="mouth" />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>{t("redteam.run.field.model")}</Th>
              <Th>{t("redteam.run.field.status")}</Th>
              <Th className="text-right">{t("redteam.run.field.passed")}</Th>
              <Th className="text-right">{t("redteam.run.field.failed")}</Th>
              <Th className="text-right">{t("redteam.run.field.error")}</Th>
              <Th>{t("redteam.run.field.startedAt")}</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-mono text-xs">
                  <Link
                    href={`/redteam/runs/${r.id}`}
                    className="underline text-accent"
                  >
                    {r.model}
                  </Link>
                </Td>
                <Td>{r.status}</Td>
                <Td className="text-right text-success">{r.passedCount}</Td>
                <Td className="text-right text-danger">{r.failedCount}</Td>
                <Td className="text-right text-tertiary">{r.errorCount}</Td>
                <Td className="text-tertiary">
                  {r.startedAt ? new Date(r.startedAt).toLocaleString() : "—"}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
