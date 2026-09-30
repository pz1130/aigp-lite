import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { IncidentTrendReport, IncidentTrendCluster } from "@/lib/prisma";
import type { TrendStats, TrendDeltas } from "./stats";

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

function TrendsDoc({
  report,
  clusters,
}: {
  report: IncidentTrendReport;
  clusters: IncidentTrendCluster[];
}) {
  const stats = report.statsJson as unknown as TrendStats;
  const deltas = report.deltaJson as unknown as TrendDeltas | null;
  const narrated = clusters.filter((c) => !c.isLongTail);
  const longTailCount = clusters
    .filter((c) => c.isLongTail)
    .reduce((n, c) => n + c.memberCount, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.h1}>
          Incident Trends Report — v{report.version}
        </Text>
        <Text style={styles.meta}>
          Window: {report.windowStart.toISOString().slice(0, 10)} →{" "}
          {report.windowEnd.toISOString().slice(0, 10)}
        </Text>
        <Text style={styles.meta}>Status: {report.status}</Text>
        <Text style={styles.meta}>
          Total incidents in window: {stats.total}
        </Text>

        <Text style={styles.h2}>Executive Summary</Text>
        <Text style={styles.para}>{report.execSummary || "—"}</Text>

        <Text style={styles.h2}>Category Trends</Text>
        {deltas &&
          Object.entries(deltas.byCategory).map(([k, v]) => (
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
        {(!deltas || Object.keys(deltas.byCategory).length === 0) && (
          <Text style={styles.small}>No category delta data.</Text>
        )}

        <Text style={styles.h2}>Severity Trends</Text>
        {deltas &&
          Object.entries(deltas.bySeverity).map(([k, v]) => (
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
        {(!deltas || Object.keys(deltas.bySeverity).length === 0) && (
          <Text style={styles.small}>No severity delta data.</Text>
        )}

        <Text style={styles.h2}>Incident Clusters</Text>
        {narrated.map((c) => (
          <View key={c.id} style={styles.clusterBox} wrap={false}>
            <Text style={styles.clusterTitle}>
              {c.label || "Unnamed cluster"}
            </Text>
            <Text style={styles.badge}>
              {c.dominantSeverity} severity ·{" "}
              {c.dominantCategory ?? "uncategorized"} · {c.memberCount} incident
              {c.memberCount !== 1 ? "s" : ""} · confidence:{" "}
              {c.confidence || "—"}
            </Text>
            <Text style={styles.para}>{c.narrative || "—"}</Text>
            <Text style={styles.meta}>
              Recommendation: {c.systemicRecommendation || "—"}
            </Text>
          </View>
        ))}
        {narrated.length === 0 && (
          <Text style={styles.small}>No clusters in this report.</Text>
        )}

        {longTailCount > 0 && (
          <Text style={styles.small}>
            Long tail: {longTailCount} incident{longTailCount !== 1 ? "s" : ""}{" "}
            below clustering threshold.
          </Text>
        )}
      </Page>
    </Document>
  );
}

export async function renderTrendsPdf(
  report: IncidentTrendReport,
  clusters: IncidentTrendCluster[],
): Promise<Buffer> {
  return renderToBuffer(<TrendsDoc report={report} clusters={clusters} />);
}
