"use client";
import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { Card, CardBody } from "@/components/ui/card";
import { ImportBillingForm } from "./ImportBillingForm";
import { Upload } from "lucide-react";

type GroupBy = "day" | "apiKey" | "usecase" | "model" | "provider";

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtCost(n: number) {
  return `$${n.toFixed(4)}`;
}

function todayMinusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function CostDashboard() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const [startDate, setStartDate] = useState(() =>
    todayMinusDays(30).toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [importOpen, setImportOpen] = useState(false);

  const period = useMemo(
    () => ({
      start: new Date(startDate),
      end: new Date(endDate + "T23:59:59"),
    }),
    [startDate, endDate],
  );

  const totalsQ = trpc.finops.cost.totals.useQuery(
    { period },
    {
      enabled: !!period,
    },
  );
  const summaryQ = trpc.finops.cost.summary.useQuery(
    { period, groupBy },
    { enabled: !!period },
  );

  const labels: Record<GroupBy, string> = {
    day: "Day",
    apiKey: "API Key",
    usecase: "Usecase",
    model: "Model",
    provider: "Provider",
  };

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-3">
        {totalsQ.isLoading ? (
          <p className="col-span-4 text-sm text-tertiary">
            {t("common.loading")}
          </p>
        ) : (
          <>
            <KpiCard
              label={t("finops.costs.kpi.totalCost")}
              value={fmtCost(totalsQ.data?.totalCost ?? 0)}
            />
            <KpiCard
              label={t("finops.costs.kpi.invocations")}
              value={fmt(totalsQ.data?.totalInvocations ?? 0)}
            />
            <KpiCard
              label={t("finops.costs.kpi.inputTokens")}
              value={fmt(totalsQ.data?.inputTokens ?? 0)}
            />
            <KpiCard
              label={t("finops.costs.kpi.outputTokens")}
              value={fmt(totalsQ.data?.outputTokens ?? 0)}
            />
          </>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 text-sm">
          <label>
            {t("finops.costs.start")}:
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-36"
            />
          </label>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <label>
            {t("finops.costs.end")}:
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-36"
            />
          </label>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setImportOpen(true)}
        >
          <Upload size={14} />
          {t("finops.import.title")}
        </Button>
      </div>

      <ImportBillingForm
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => {
          utils.finops.cost.totals.invalidate();
          utils.finops.cost.summary.invalidate();
        }}
      />

      {/* GroupBy tabs */}
      <div className="flex gap-1">
        {(Object.keys(labels) as GroupBy[]).map((k) => (
          <Button
            key={k}
            variant={groupBy === k ? "primary" : "secondary"}
            size="sm"
            onClick={() => setGroupBy(k)}
          >
            {labels[k]}
          </Button>
        ))}
      </div>

      <Table>
        <THead>
          <Tr>
            <Th>{t("finops.costs.col.bucket")}</Th>
            <Th className="text-right">{t("finops.costs.col.cost")}</Th>
            <Th className="text-right">{t("finops.costs.col.invocations")}</Th>
            <Th className="text-right">{t("finops.costs.col.inputTokens")}</Th>
            <Th className="text-right">{t("finops.costs.col.outputTokens")}</Th>
          </Tr>
        </THead>
        <TBody>
          {summaryQ.isLoading ? (
            <Tr>
              <Td colSpan={5} className="p-4 text-center text-tertiary">
                {t("common.loading")}
              </Td>
            </Tr>
          ) : summaryQ.data?.length === 0 ? (
            <Tr>
              <Td colSpan={5} className="p-4 text-center text-tertiary">
                {t("finops.costs.empty")}
              </Td>
            </Tr>
          ) : (
            summaryQ.data!.map((row) => (
              <Tr key={row.key}>
                <Td>{row.key}</Td>
                <Td className="text-right">{fmtCost(row.costUsd)}</Td>
                <Td className="text-right">{fmt(row.invocations)}</Td>
                <Td className="text-right">{fmt(row.inputTokens)}</Td>
                <Td className="text-right">{fmt(row.outputTokens)}</Td>
              </Tr>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="hover:shadow-md hover:border-border-strong/60 transition-all duration-200 hover:-translate-y-px">
      <CardBody className="p-3">
        <p className="text-xs text-tertiary">{label}</p>
        <p className="text-lg font-semibold font-mono">{value}</p>
      </CardBody>
    </Card>
  );
}
