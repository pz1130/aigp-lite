import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { TxrReport, User, AiUsecase, Organization } from "@/lib/prisma";
import type { TxrSnapshot } from "./aggregate";
import type { TxrOrgSnapshot } from "./org-aggregate";
import { SECTIONS } from "./sections";

export type TxrReportWithIncludes = TxrReport & {
  org: Pick<Organization, "id" | "name">;
  usecase: Pick<AiUsecase, "id" | "name"> | null;
  createdBy: Pick<User, "id" | "name" | "email">;
  approvedBy?: Pick<User, "id" | "name" | "email"> | null;
  publishedBy?: Pick<User, "id" | "name" | "email"> | null;
};

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica" },
  h1: { fontSize: 16, fontWeight: 700, marginBottom: 8 },
  h2: {
    fontSize: 12,
    fontWeight: 700,
    marginTop: 12,
    marginBottom: 4,
    borderBottom: 1,
    paddingBottom: 2,
  },
  meta: { color: "#555", marginBottom: 3, fontSize: 9 },
  rowt: { flexDirection: "row", marginBottom: 2 },
  cell: { width: 120 },
  stat: { width: 70 },
  body: { flex: 1 },
  para: { marginBottom: 6, lineHeight: 1.4 },
  small: { fontSize: 8, color: "#666" },
});

const tierLabel = (n: number) => (n === 0 ? "Not reached" : `Tier ${n}`);
const arrow = (d: string) =>
  d === "up" ? "▲" : d === "down" ? "▼" : d === "new" ? "＋" : "＝";

export function TxrDoc({
  report,
  snapshot,
}: {
  report: TxrReportWithIncludes;
  snapshot: TxrSnapshot;
}) {
  const authored = (report.sections as Record<string, string>) ?? {};
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.h1}>
          Transparency Report — {report.title} ({report.periodLabel}, v
          {report.version})
        </Text>
        <Text style={styles.meta}>Organization: {report.org.name}</Text>
        <Text style={styles.meta}>
          Scope:{" "}
          {report.usecase
            ? `Usecase — ${report.usecase.name}`
            : "Organization-level"}
        </Text>
        <Text style={styles.meta}>
          Period: {report.periodStart.toISOString().slice(0, 10)} →{" "}
          {report.periodEnd.toISOString().slice(0, 10)}
        </Text>
        <Text style={styles.meta}>Status: {report.status}</Text>
        {report.approvedBy && (
          <Text style={styles.meta}>Approved by: {report.approvedBy.name}</Text>
        )}
        {report.publishedBy && (
          <Text style={styles.meta}>
            Published by: {report.publishedBy.name}
          </Text>
        )}

        <Text style={styles.h2}>Systemic-risk tiers</Text>
        {!snapshot.frt.found && (
          <Text style={styles.small}>
            No approved Frontier Risk Tier assessment found for this scope.
          </Text>
        )}
        <Text style={styles.meta}>
          Overall: {tierLabel(snapshot.frt.overallTier)}
        </Text>
        {snapshot.frt.byCategory.map((c) => (
          <View key={c.code} style={styles.rowt}>
            <Text style={styles.body}>{c.title}</Text>
            <Text style={styles.stat}>{tierLabel(c.assignedTier)}</Text>
            <Text style={styles.stat}>{c.completionPct}%</Text>
          </View>
        ))}

        <Text style={styles.h2}>Changes since last edition</Text>
        {snapshot.tierDeltas.priorEdition ? (
          <Text style={styles.small}>
            vs v{snapshot.tierDeltas.priorEdition.version} (
            {snapshot.tierDeltas.priorEdition.periodLabel})
          </Text>
        ) : (
          <Text style={styles.small}>
            First published edition — no prior tiers to compare.
          </Text>
        )}
        {snapshot.tierDeltas.byCategory.map((d) => (
          <View key={d.code} style={styles.rowt}>
            <Text style={styles.body}>{d.code}</Text>
            <Text style={styles.stat}>
              {tierLabel(d.from)} → {tierLabel(d.to)}
            </Text>
            <Text style={styles.stat}>{arrow(d.direction)}</Text>
          </View>
        ))}
        {authored.changes_note && (
          <Text style={styles.para}>{authored.changes_note}</Text>
        )}

        <Text style={styles.h2}>Incident summary</Text>
        <Text style={styles.meta}>
          Total: {snapshot.incidents.total} · critical{" "}
          {snapshot.incidents.bySeverity.critical} · high{" "}
          {snapshot.incidents.bySeverity.high} · medium{" "}
          {snapshot.incidents.bySeverity.medium} · low{" "}
          {snapshot.incidents.bySeverity.low}
        </Text>
        {Object.entries(snapshot.incidents.byCategory).map(([k, v]) => (
          <Text key={k} style={styles.small}>
            {k}: {v}
          </Text>
        ))}

        <Text style={styles.h2}>
          Model quality & posture (organization-level)
        </Text>
        <Text style={styles.meta}>
          Latest drift avg score: {snapshot.drift.latestRun?.avgScore ?? "n/a"}
          {snapshot.drift.latestRun?.degraded ? " (degraded)" : ""} · degraded
          runs in period: {snapshot.drift.degradedRunsInPeriod}/
          {snapshot.drift.runsInPeriod}
        </Text>
        <Text style={styles.meta}>Posture score: {snapshot.posture.score}</Text>
      </Page>

      <Page size="A4" style={styles.page} wrap>
        {SECTIONS.filter((s) => s.key !== "changes_note").map((s) => (
          <View key={s.key} wrap={false}>
            <Text style={styles.h2}>{s.title}</Text>
            <Text style={styles.para}>{authored[s.key] || "—"}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

function TxrOrgDoc({
  report,
  snapshot,
}: {
  report: TxrReportWithIncludes;
  snapshot: TxrOrgSnapshot;
}) {
  const t = snapshot.totals;
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.h1}>{report.title}</Text>
        <Text style={styles.meta}>
          Scope: Organization-level portfolio · {report.periodLabel} · v
          {report.version}
        </Text>

        <Text style={styles.h2}>Systems ({t.systemCount})</Text>
        {snapshot.portfolio.map((p) => (
          <Text key={p.usecaseId} style={styles.para}>
            {p.name} — tier {p.frtTier === 0 ? "not reached" : p.frtTier} ·{" "}
            {p.readinessState} · incidents {p.incidents.total}
          </Text>
        ))}

        <Text style={styles.h2}>Portfolio totals</Text>
        <Text style={styles.para}>
          Ready {t.byReadiness.ready} · Conditionally{" "}
          {t.byReadiness.conditionally_ready} · Not ready{" "}
          {t.byReadiness.not_ready} · Live {t.byReadiness.live}
        </Text>
        <Text style={styles.para}>
          Worst tier {t.worstTier} · High-risk blocked {t.highRiskBlocked}
        </Text>

        <Text style={styles.h2}>Changes since last edition</Text>
        <Text style={styles.para}>
          {snapshot.deltas.priorEdition
            ? `vs v${snapshot.deltas.priorEdition.version} (${snapshot.deltas.priorEdition.periodLabel})`
            : "First edition — no prior to compare"}
        </Text>
        <Text style={styles.para}>
          Systems {snapshot.deltas.systemCount.from} →{" "}
          {snapshot.deltas.systemCount.to} · Worst tier{" "}
          {snapshot.deltas.worstTier.from} → {snapshot.deltas.worstTier.to} ·
          Incidents {snapshot.deltas.incidentsTotal.from} →{" "}
          {snapshot.deltas.incidentsTotal.to}
        </Text>

        <Text style={styles.h2}>Org-wide incidents (in period)</Text>
        <Text style={styles.para}>
          Total {t.incidents.total} · critical {t.incidents.bySeverity.critical}{" "}
          · high {t.incidents.bySeverity.high}
        </Text>

        <Text style={styles.h2}>Quality</Text>
        <Text style={styles.para}>
          Posture {snapshot.posture.score} · drift avg{" "}
          {snapshot.drift.latestRun?.avgScore ?? "n/a"}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderTxrPdf(
  report: TxrReportWithIncludes,
  snapshot: TxrSnapshot | TxrOrgSnapshot,
): Promise<Buffer> {
  const doc =
    "portfolio" in snapshot ? (
      <TxrOrgDoc report={report} snapshot={snapshot} />
    ) : (
      <TxrDoc report={report} snapshot={snapshot} />
    );
  return renderToBuffer(doc);
}
