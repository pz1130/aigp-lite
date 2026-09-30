import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { UsageInsightReport, UsageInsightCluster } from "@/lib/prisma";
import type { UsageDeltas } from "./stats";

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
  clusterBox: {
    marginTop: 6,
    marginBottom: 6,
    padding: 4,
    border: 1,
    borderColor: "#ccc",
  },
  clusterTitle: { fontSize: 10, fontWeight: 700, marginBottom: 2 },
  badge: { fontSize: 8, color: "#888", marginBottom: 2 },
});

function UsageInsightsDoc({
  report,
  clusters,
}: {
  report: UsageInsightReport;
  clusters: UsageInsightCluster[];
}) {
  const deltas = report.deltaJson as unknown as UsageDeltas | null;
  const narrated = clusters.filter((c) => !c.isLongTail);
  const longTailCount = clusters
    .filter((c) => c.isLongTail)
    .reduce((n, c) => n + c.invocationCount, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.h1}>Usage Insights Report — v{report.version}</Text>
        <Text style={styles.meta}>
          Window: {report.windowStart.toISOString().slice(0, 10)} →{" "}
          {report.windowEnd.toISOString().slice(0, 10)}
        </Text>
        <Text style={styles.meta}>Status: {report.status}</Text>
        <Text style={styles.meta}>
          Consented invocations: {report.totalInvocations}
        </Text>
        <Text style={styles.meta}>
          Clusters below k={report.k} suppressed (
          {report.suppressedClusterCount}
          ).
        </Text>

        <Text style={styles.h2}>Executive Summary</Text>
        <Text style={styles.para}>{report.execSummary || "—"}</Text>

        <Text style={styles.h2}>Tool Trends</Text>
        {deltas &&
          Object.entries(deltas.byTool).map(([k, v]) => (
            <View key={k} style={styles.rowt}>
              <Text style={styles.body}>{k}</Text>
              <Text style={styles.stat}>prev {v.prev}</Text>
              <Text style={styles.stat}>curr {v.curr}</Text>
              <Text style={styles.stat}>
                {v.pct != null
                  ? `${v.pct > 0 ? "+" : ""}${v.pct}%`
                  : "baseline"}
              </Text>
            </View>
          ))}
        {(!deltas || Object.keys(deltas.byTool).length === 0) && (
          <Text style={styles.small}>No tool delta data.</Text>
        )}

        <Text style={styles.h2}>Outcome Trends</Text>
        {deltas &&
          Object.entries(deltas.byOutcome).map(([k, v]) => (
            <View key={k} style={styles.rowt}>
              <Text style={styles.body}>{k}</Text>
              <Text style={styles.stat}>prev {v.prev}</Text>
              <Text style={styles.stat}>curr {v.curr}</Text>
              <Text style={styles.stat}>
                {v.pct != null
                  ? `${v.pct > 0 ? "+" : ""}${v.pct}%`
                  : "baseline"}
              </Text>
            </View>
          ))}
        {(!deltas || Object.keys(deltas.byOutcome).length === 0) && (
          <Text style={styles.small}>No outcome delta data.</Text>
        )}

        <Text style={styles.h2}>Usage Themes</Text>
        {narrated.map((c) => {
          const topTools = c.topToolNames as unknown as {
            toolName: string;
            count: number;
          }[];
          const topTool = topTools.length > 0 ? topTools[0].toolName : "—";
          return (
            <View key={c.id} style={styles.clusterBox} wrap={false}>
              <Text style={styles.clusterTitle}>
                {c.themeLabel || "Unnamed theme"}
              </Text>
              <Text style={styles.badge}>
                {c.invocationCount} invocation
                {c.invocationCount !== 1 ? "s" : ""} · {c.distinctActorCount}{" "}
                distinct actor
                {c.distinctActorCount !== 1 ? "s" : ""} · top tool: {topTool} ·
                confidence: {c.confidence || "—"}
              </Text>
              <Text style={styles.para}>{c.narrative || "—"}</Text>
              <Text style={styles.meta}>
                Observation: {c.systemicObservation || "—"}
              </Text>
            </View>
          );
        })}
        {narrated.length === 0 && (
          <Text style={styles.small}>
            No themes above the k-anonymity floor.
          </Text>
        )}

        {longTailCount > 0 && (
          <Text style={styles.small}>
            Long tail: {longTailCount} invocation
            {longTailCount !== 1 ? "s" : ""} below clustering threshold.
          </Text>
        )}
      </Page>
    </Document>
  );
}

export async function renderUsageInsightsPdf(
  report: UsageInsightReport,
  clusters: UsageInsightCluster[],
): Promise<Buffer> {
  return renderToBuffer(
    <UsageInsightsDoc report={report} clusters={clusters} />,
  );
}
