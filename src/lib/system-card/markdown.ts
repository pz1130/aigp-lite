import type { SystemCardData } from "./aggregator";

const dt = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : "—";

export function renderSystemCardMarkdown(d: SystemCardData): string {
  const s = d.snapshot;
  const lines: string[] = [];

  lines.push(`# System Card: ${s.system.name}`);
  lines.push("");
  lines.push(`> Generated ${dt(d.generatedAt)} by ${d.generatedBy.name}`);
  lines.push("");

  lines.push("## 1. System Overview");
  lines.push(`- **Name**: ${s.system.name}`);
  lines.push(`- **Owner**: ${s.system.ownerName ?? "(unassigned)"}`);
  lines.push(`- **Lifecycle stage**: \`${s.system.lifecycleStage}\``);
  lines.push(`- **Autonomy level**: \`${s.system.autonomyLevel}\``);
  lines.push(`- **Deployment type**: \`${s.system.deploymentType}\``);
  lines.push(
    `- **Human oversight attested**: ${
      s.system.humanOversightAttested
        ? `yes (${s.system.humanOversightAttestedByName ?? "unknown"}, ${dt(
            s.system.humanOversightAttestedAt,
          )})`
        : "no"
    }`,
  );
  lines.push("");
  lines.push(s.system.description || "_(no description documented)_");
  lines.push("");

  lines.push("## 2. Intended Use & Prohibited Uses");
  lines.push("**Intended use:**");
  lines.push("");
  lines.push(d.intendedUse);
  lines.push("");
  lines.push("**Prohibited / out-of-scope use:**");
  lines.push("");
  lines.push(d.prohibitedUse);
  lines.push("");

  lines.push("## 3. Classification & Risk");
  if (s.classification.present) {
    lines.push(
      `- **EU AI Act category**: \`${s.classification.euAiActCategory ?? "unclassified"}\`${
        s.classification.isHighRisk ? " (high risk)" : ""
      }`,
    );
    lines.push(
      `- **Contains PII**: ${s.classification.containsPii ? "yes" : "no"}`,
    );
    lines.push(
      `- **Data sensitivity**: ${s.classification.dataSensitivity ?? "—"}`,
    );
  } else {
    lines.push("_(not classified)_");
  }
  if (d.latestAssessment) {
    lines.push(
      `- **Latest risk assessment**: **${d.latestAssessment.level.toUpperCase()}** (score ${d.latestAssessment.scoreInt}, ${dt(d.latestAssessment.assessedAt)})`,
    );
    if (d.latestAssessment.notes) lines.push(`  - ${d.latestAssessment.notes}`);
  } else {
    lines.push("- **Latest risk assessment**: _(none recorded)_");
  }
  lines.push(
    `- **Controls not yet satisfied**: ${s.risk.controlsNotSatisfied}`,
  );
  lines.push(
    `- **Catalog risk links**: ${s.regulatoryRisks.total} (${s.regulatoryRisks.withoutRationale} without rationale)`,
  );
  lines.push("");

  lines.push("## 4. Readiness & Go-live");
  lines.push(
    `Overall state: **${d.readiness.state}** — ${d.readiness.blockingFailing} blocking failing, ${d.readiness.advisoryOpen} advisory open.`,
  );
  lines.push("");
  lines.push("| Check | Status | Severity | Articles |");
  lines.push("| --- | --- | --- | --- |");
  for (const c of d.readiness.checks) {
    lines.push(
      `| ${c.id} | ${c.status} | ${c.severity} | ${c.articleRefs.join(", ") || "—"} |`,
    );
  }
  lines.push("");
  if (s.goLive) {
    lines.push(
      `Go-live decision: **${s.goLive.status}** by ${s.goLive.decidedByName ?? "—"} on ${dt(s.goLive.decidedAt)}.`,
    );
    if (s.goLive.rationale) lines.push(`Rationale: ${s.goLive.rationale}`);
    if (s.goLive.conditions.length > 0) {
      lines.push("Conditions:");
      for (const c of s.goLive.conditions) lines.push(`- ${c}`);
    }
  } else {
    lines.push("Go-live decision: _(none recorded)_");
  }
  lines.push("");

  lines.push("## 5. Evaluations & Red-teaming");
  if (d.evaluations.length === 0) {
    lines.push("_(no completed evaluations)_");
  } else {
    for (const e of d.evaluations) {
      const passRate =
        e.totalPrompts > 0
          ? ((e.passedCount / e.totalPrompts) * 100).toFixed(1)
          : "—";
      lines.push(
        `- ${dt(e.createdAt)} · \`${e.model}\` · ${e.passedCount} / ${e.totalPrompts} passed (${passRate}%) · failures: ${e.failedCount}, errors: ${e.errorCount}`,
      );
    }
  }
  lines.push("");
  lines.push("### Independent external attestations");
  lines.push("_Org-reported; not independently verified by the platform._");
  if (d.externalAttestations.length === 0) {
    lines.push("None on record.");
  } else {
    for (const a of d.externalAttestations) {
      const window =
        a.engagementStart || a.engagementEnd
          ? ` · engagement ${dt(a.engagementStart)} – ${dt(a.engagementEnd)}`
          : "";
      lines.push(
        `- **${a.attesterName}**${a.attesterOrg ? ` (${a.attesterOrg})` : ""} · attested ${dt(a.attestedAt)}${window}`,
      );
      lines.push(`  - Scope: ${a.scope}`);
      lines.push(`  - Report SHA-256: \`${a.reportSha256}\``);
      if (a.summary) lines.push(`  - Summary: ${a.summary}`);
    }
  }
  lines.push("");

  lines.push("## 6. Drift Monitoring");
  if (d.driftBenchmarks.length === 0) {
    lines.push("_(no drift benchmarks)_");
  } else {
    for (const b of d.driftBenchmarks) {
      const run = b.latestRun
        ? `latest run ${dt(b.latestRun.completedAt)}: avg ${b.latestRun.avgScore ?? "—"} / threshold ${b.threshold}${
            b.latestRun.degraded ? " — DEGRADED" : ""
          }`
        : "no completed runs";
      lines.push(`- **${b.name}** — ${run}`);
    }
  }
  lines.push("");

  lines.push("## 7. Compliance Artifacts");
  lines.push(`FRIA records (${d.friaRecords.length}):`);
  if (d.friaRecords.length === 0) lines.push("- _(none)_");
  for (const f of d.friaRecords) {
    lines.push(
      `- ${f.title} v${f.version} — \`${f.status}\` (${dt(f.updatedAt)})`,
    );
  }
  lines.push("");
  lines.push(
    `Published transparency reports (${d.transparencyReports.length}):`,
  );
  if (d.transparencyReports.length === 0) lines.push("- _(none)_");
  for (const r of d.transparencyReports) {
    lines.push(`- ${r.title} v${r.version} — published ${dt(r.publishedAt)}`);
  }
  lines.push("");

  lines.push("## 8. Incidents");
  lines.push(`Open high/critical incidents: ${s.incidents.openHighOrCritical}`);
  for (const i of d.openIncidents) {
    lines.push(
      `- **${i.severity.toUpperCase()}** — ${i.title} (opened ${dt(i.openedAt)})`,
    );
  }
  lines.push("");

  lines.push("## 9. Known Limitations");
  lines.push(d.knownLimitations);
  lines.push("");

  lines.push("## 10. Generation Metadata");
  lines.push(
    `- Generated ${d.generatedAt.toISOString()} by ${d.generatedBy.name}`,
  );
  lines.push(
    "- Generated from live AIGP records; source modules remain the system of record.",
  );

  return lines.join("\n");
}
