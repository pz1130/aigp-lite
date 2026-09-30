import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";

export interface AssessmentReportData {
  orgName: string;
  usecaseName: string;
  autonomyLevel: string;
  scoreInt: number;
  level: string;
  notes: string;
  assessedAt: Date;
  assessedByName: string;
  controls: {
    code: string;
    framework: string;
    title: string;
    severity: string;
    status: string;
  }[];
  catalogRisks?: {
    source: string;
    code: string;
    title: string;
    severity: string;
    rationale: string;
  }[];
  generatedAt?: Date;
}

/** Short proper-noun labels for each catalog source, used in the PDF. */
const CATALOG_SOURCE_LABEL: Record<string, string> = {
  FINOS_AIGF: "FINOS AIGF",
  MITRE_ATLAS: "MITRE ATLAS",
  NIST_AI_RMF: "NIST AI RMF",
  ISO_42001: "ISO 42001",
  EU_AI_ACT: "EU AI Act",
  custom: "Custom",
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica" },
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
  section: { marginBottom: 12 },
  scoreBox: {
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 4,
  },
  scoreLabel: { fontSize: 9, color: "#555", marginBottom: 2 },
  scoreValue: { fontSize: 24, fontWeight: 700 },
  levelLow: { color: "#0a7a3b" },
  levelMedium: { color: "#b27300" },
  levelHigh: { color: "#a00" },
  controlRow: {
    flexDirection: "row",
    marginBottom: 3,
    paddingBottom: 2,
    borderBottom: "0.5pt solid #ddd",
  },
  controlFw: { width: 60, fontSize: 8, color: "#888" },
  controlId: { width: 50, fontWeight: 700, fontSize: 9 },
  controlTitle: { flex: 1, fontSize: 9 },
  controlSeverity: { width: 50, fontSize: 9, textAlign: "center" },
  controlStatus: { width: 80, fontSize: 9, textAlign: "right" },
  catalogRow: {
    flexDirection: "row",
    marginBottom: 4,
    paddingBottom: 3,
    borderBottom: "0.5pt solid #ddd",
  },
  catalogSource: { width: 70, fontSize: 8, color: "#888" },
  catalogId: { width: 90, fontSize: 8, color: "#888" },
  catalogBody: { flex: 1 },
  catalogTitle: { fontSize: 9, fontWeight: 700 },
  catalogRationale: { fontSize: 8, color: "#555", marginTop: 1 },
  catalogSeverity: { width: 50, fontSize: 9, textAlign: "right" },
  statusOk: { color: "#0a7a3b" },
  statusProgress: { color: "#b27300" },
  statusFail: { color: "#a00" },
  statusNa: { color: "#888" },
  statusDefault: { color: "#555" },
});

function levelStyle(level: string) {
  if (level === "low") return styles.levelLow;
  if (level === "medium") return styles.levelMedium;
  return styles.levelHigh;
}

function statusStyle(s: string) {
  if (s === "satisfied") return styles.statusOk;
  if (s === "in_progress") return styles.statusProgress;
  if (s === "failed") return styles.statusFail;
  if (s === "not_applicable") return styles.statusNa;
  return styles.statusDefault;
}

function AssessmentDoc({ data }: { data: AssessmentReportData }) {
  const byFramework = new Map<string, typeof data.controls>();
  for (const c of data.controls) {
    if (!byFramework.has(c.framework)) byFramework.set(c.framework, []);
    byFramework.get(c.framework)!.push(c);
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Risk Assessment Report</Text>
        <Text style={styles.meta}>Organization: {data.orgName}</Text>
        <Text style={styles.meta}>Use Case: {data.usecaseName}</Text>
        <Text style={styles.meta}>Autonomy Level: {data.autonomyLevel}</Text>
        <Text style={styles.meta}>
          Assessed: {data.assessedAt.toISOString().slice(0, 10)} by{" "}
          {data.assessedByName}
        </Text>

        <View style={styles.scoreBox}>
          <Text style={styles.scoreLabel}>Risk Score</Text>
          <Text style={[styles.scoreValue, levelStyle(data.level)]}>
            {data.scoreInt}/100 — {data.level.toUpperCase()}
          </Text>
        </View>

        {data.notes && (
          <View style={styles.section}>
            <Text style={styles.h2}>Notes</Text>
            <Text>{data.notes}</Text>
          </View>
        )}

        <Text style={styles.h2}>Control Statuses</Text>
        {[...byFramework.entries()].map(([fw, controls]) => (
          <View key={fw} wrap={false}>
            <Text
              style={{
                fontSize: 10,
                fontWeight: 700,
                marginTop: 6,
                marginBottom: 2,
              }}
            >
              {fw}
            </Text>
            {controls.map((c) => (
              <View key={c.code} style={styles.controlRow}>
                <Text style={styles.controlId}>{c.code}</Text>
                <Text style={styles.controlTitle}>{c.title}</Text>
                <Text style={styles.controlSeverity}>{c.severity}</Text>
                <Text style={[styles.controlStatus, statusStyle(c.status)]}>
                  {c.status}
                </Text>
              </View>
            ))}
          </View>
        ))}

        {data.catalogRisks && data.catalogRisks.length > 0 && (
          <View>
            <Text style={[styles.h2, { marginTop: 16 }]}>
              Catalog &amp; Regulatory Risks
            </Text>
            {[...data.catalogRisks]
              .sort(
                (a, b) =>
                  (SEVERITY_RANK[a.severity] ?? 9) -
                    (SEVERITY_RANK[b.severity] ?? 9) ||
                  a.source.localeCompare(b.source) ||
                  a.code.localeCompare(b.code),
              )
              .map((r) => (
                <View
                  key={`${r.source}-${r.code}`}
                  style={styles.catalogRow}
                  wrap={false}
                >
                  <Text style={styles.catalogSource}>
                    {CATALOG_SOURCE_LABEL[r.source] ?? r.source}
                  </Text>
                  <Text style={styles.catalogId}>{r.code}</Text>
                  <View style={styles.catalogBody}>
                    <Text style={styles.catalogTitle}>{r.title}</Text>
                    {r.rationale ? (
                      <Text style={styles.catalogRationale}>{r.rationale}</Text>
                    ) : null}
                  </View>
                  <Text
                    style={[styles.catalogSeverity, levelStyle(r.severity)]}
                  >
                    {r.severity}
                  </Text>
                </View>
              ))}
          </View>
        )}

        <Text style={[styles.h2, { marginTop: 20 }]}>Methodology</Text>
        <Text style={{ fontSize: 8, color: "#666" }}>
          Score = base (from autonomy level) + 5 per failed control (max +30) -
          2 per satisfied high-severity control (max -15). Clamped to 0-100.
          Low: &lt;30, Medium: &lt;70, High: 70+.
        </Text>

        {data.generatedAt &&
          Math.abs(data.generatedAt.getTime() - data.assessedAt.getTime()) >
            60_000 && (
            <Text style={{ fontSize: 8, color: "#888", marginTop: 8 }}>
              Generated {data.generatedAt.toISOString().slice(0, 10)} from
              current control state — controls may have changed since assessment
              date.
            </Text>
          )}
      </Page>
    </Document>
  );
}

export async function renderAssessmentPdf(
  data: AssessmentReportData,
): Promise<Buffer> {
  const blob = await pdf(<AssessmentDoc data={data} />).toBlob();
  return Buffer.from(await blob.arrayBuffer());
}
