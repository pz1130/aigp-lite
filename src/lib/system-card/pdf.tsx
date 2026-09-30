import React from "react";
import { Document, Page, Text, StyleSheet, pdf } from "@react-pdf/renderer";
import type { SystemCardData } from "./aggregator";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica" },
  h1: { fontSize: 18, fontWeight: 700, marginBottom: 8 },
  h2: {
    fontSize: 12,
    fontWeight: 700,
    marginTop: 12,
    marginBottom: 4,
    borderBottom: 1,
    paddingBottom: 2,
  },
  para: { marginBottom: 4 },
  meta: { color: "#666", marginBottom: 6, fontSize: 9 },
  fail: { marginBottom: 4, color: "#a00" },
  warn: { marginBottom: 4, color: "#b27300" },
});

const dt = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : "—";

function checkStyle(status: string) {
  if (status === "fail") return s.fail;
  if (status === "warn") return s.warn;
  return s.para;
}

function Doc({ data }: { data: SystemCardData }) {
  const sys = data.snapshot.system;
  const cls = data.snapshot.classification;
  const snap = data.snapshot;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>System Card: {sys.name}</Text>
        <Text style={s.meta}>
          Generated {dt(data.generatedAt)} by {data.generatedBy.name}
        </Text>

        <Text style={s.h2}>1. System Overview</Text>
        <Text style={s.para}>Owner: {sys.ownerName ?? "(unassigned)"}</Text>
        <Text style={s.para}>Lifecycle stage: {sys.lifecycleStage}</Text>
        <Text style={s.para}>Autonomy level: {sys.autonomyLevel}</Text>
        <Text style={s.para}>Deployment type: {sys.deploymentType}</Text>
        <Text style={s.para}>
          Human oversight attested:{" "}
          {sys.humanOversightAttested
            ? `yes (${sys.humanOversightAttestedByName ?? "unknown"}, ${dt(
                sys.humanOversightAttestedAt,
              )})`
            : "no"}
        </Text>
        <Text style={s.para}>
          {sys.description || "(no description documented)"}
        </Text>

        <Text style={s.h2}>2. Intended Use & Prohibited Uses</Text>
        <Text style={s.para}>Intended use:</Text>
        <Text style={s.para}>{data.intendedUse}</Text>
        <Text style={s.para}>Prohibited / out-of-scope use:</Text>
        <Text style={s.para}>{data.prohibitedUse}</Text>

        <Text style={s.h2}>3. Classification & Risk</Text>
        {cls.present ? (
          <>
            <Text style={s.para}>
              EU AI Act category: {cls.euAiActCategory ?? "unclassified"}
              {cls.isHighRisk ? " (high risk)" : ""}
            </Text>
            <Text style={s.para}>
              Contains PII: {cls.containsPii ? "yes" : "no"} · Data sensitivity:{" "}
              {cls.dataSensitivity ?? "—"}
            </Text>
          </>
        ) : (
          <Text style={s.para}>(not classified)</Text>
        )}
        {data.latestAssessment ? (
          <Text style={s.para}>
            Latest risk assessment: {data.latestAssessment.level.toUpperCase()}{" "}
            (score {data.latestAssessment.scoreInt},{" "}
            {dt(data.latestAssessment.assessedAt)})
            {data.latestAssessment.notes
              ? ` — ${data.latestAssessment.notes}`
              : ""}
          </Text>
        ) : (
          <Text style={s.para}>Latest risk assessment: (none recorded)</Text>
        )}
        <Text style={s.para}>
          Controls not yet satisfied: {snap.risk.controlsNotSatisfied} · Catalog
          risk links: {snap.regulatoryRisks.total} (
          {snap.regulatoryRisks.withoutRationale} without rationale)
        </Text>

        <Text style={s.h2}>4. Readiness & Go-live</Text>
        <Text style={s.para}>
          Overall state: {data.readiness.state} —{" "}
          {data.readiness.blockingFailing} blocking failing,{" "}
          {data.readiness.advisoryOpen} advisory open
        </Text>
        {data.readiness.checks.map((c) => (
          <Text key={c.id} style={checkStyle(c.status)}>
            [{c.status.toUpperCase()}] {c.id} ({c.severity}
            {c.articleRefs.length > 0 ? `, ${c.articleRefs.join(", ")}` : ""})
          </Text>
        ))}
        {snap.goLive ? (
          <Text style={s.para}>
            Go-live decision: {snap.goLive.status} by{" "}
            {snap.goLive.decidedByName ?? "—"} on {dt(snap.goLive.decidedAt)}
            {snap.goLive.rationale ? ` — ${snap.goLive.rationale}` : ""}
            {snap.goLive.conditions.length > 0
              ? ` — conditions: ${snap.goLive.conditions.join("; ")}`
              : ""}
          </Text>
        ) : (
          <Text style={s.para}>Go-live decision: (none recorded)</Text>
        )}

        <Text style={s.h2}>5. Evaluations & Red-teaming</Text>
        {data.evaluations.length === 0 ? (
          <Text style={s.para}>(no completed evaluations)</Text>
        ) : (
          data.evaluations.map((e) => {
            const passRate =
              e.totalPrompts > 0
                ? ((e.passedCount / e.totalPrompts) * 100).toFixed(1)
                : "—";
            return (
              <Text key={e.id} style={s.para}>
                {dt(e.createdAt)} · {e.model} · {e.passedCount}/{e.totalPrompts}{" "}
                passed ({passRate}%) · failures: {e.failedCount}, errors:{" "}
                {e.errorCount}
              </Text>
            );
          })
        )}

        <Text style={s.h2}>Independent external attestations</Text>
        <Text style={s.para}>
          Org-reported; not independently verified by the platform.
        </Text>
        {data.externalAttestations.length === 0 ? (
          <Text style={s.para}>None on record.</Text>
        ) : (
          data.externalAttestations.map((a) => (
            <Text key={a.id} style={s.para}>
              {a.attesterName}
              {a.attesterOrg ? ` (${a.attesterOrg})` : ""} · attested{" "}
              {dt(a.attestedAt)} · scope: {a.scope} · SHA-256: {a.reportSha256}
              {a.summary ? ` · ${a.summary}` : ""}
            </Text>
          ))
        )}

        <Text style={s.h2}>6. Drift Monitoring</Text>
        {data.driftBenchmarks.length === 0 ? (
          <Text style={s.para}>(no drift benchmarks)</Text>
        ) : (
          data.driftBenchmarks.map((b) => (
            <Text key={b.id} style={s.para}>
              {b.name} —{" "}
              {b.latestRun
                ? `latest run ${dt(b.latestRun.completedAt)}: avg ${
                    b.latestRun.avgScore ?? "—"
                  } / threshold ${b.threshold}${
                    b.latestRun.degraded ? " — DEGRADED" : ""
                  }`
                : "no completed runs"}
            </Text>
          ))
        )}

        <Text style={s.h2}>7. Compliance Artifacts</Text>
        <Text style={s.para}>FRIA records ({data.friaRecords.length}):</Text>
        {data.friaRecords.map((f) => (
          <Text key={f.id} style={s.para}>
            {f.title} v{f.version} — {f.status} ({dt(f.updatedAt)})
          </Text>
        ))}
        <Text style={s.para}>
          Published transparency reports ({data.transparencyReports.length}):
        </Text>
        {data.transparencyReports.map((r) => (
          <Text key={r.id} style={s.para}>
            {r.title} v{r.version} — published {dt(r.publishedAt)}
          </Text>
        ))}

        <Text style={s.h2}>8. Incidents</Text>
        <Text style={s.para}>
          Open high/critical incidents: {snap.incidents.openHighOrCritical}
        </Text>
        {data.openIncidents.map((i) => (
          <Text key={i.id} style={s.para}>
            [{i.severity.toUpperCase()}] {i.title} (opened {dt(i.openedAt)})
          </Text>
        ))}

        <Text style={s.h2}>9. Known Limitations</Text>
        <Text style={s.para}>{data.knownLimitations}</Text>

        <Text style={s.h2}>10. Generation Metadata</Text>
        <Text style={s.para}>
          Generated {data.generatedAt.toISOString()} by {data.generatedBy.name}
        </Text>
        <Text style={s.para}>
          Generated from live AIGP records; source modules remain the system of
          record.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderSystemCardPdf(
  data: SystemCardData,
): Promise<Buffer> {
  const blob = await pdf(<Doc data={data} />).toBlob();
  return Buffer.from(await blob.arrayBuffer());
}
