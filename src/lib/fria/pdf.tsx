import React from "react";
import {
  Document,
  Page,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { UsecaseFria, User, AiUsecase, Organization } from "@/lib/prisma";

export type FriaWithIncludes = UsecaseFria & {
  org: Pick<Organization, "id" | "name">;
  usecase: Pick<AiUsecase, "id" | "name">;
  createdBy: Pick<User, "id" | "name" | "email">;
  submittedBy?: Pick<User, "id" | "name" | "email"> | null;
  approvedBy?: Pick<User, "id" | "name" | "email"> | null;
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
  para: { marginBottom: 4 },
  label: { fontWeight: 700 },
});

function FriaDoc({ fria }: { fria: FriaWithIncludes }) {
  const sections = (fria.sectionsJson ?? {}) as Record<string, unknown>;
  const system = sections.system as
    { name?: string; annexIIICategory?: string } | undefined;
  const purpose = sections.purpose as
    { description?: string; intendedContext?: string } | undefined;
  const overall = sections.overallRisk as
    { rating?: string; rationale?: string } | undefined;
  const mitig = sections.mitigationPlan as
    | Array<{
        action: string;
        owner?: string;
        dueDate?: string;
        status?: string;
      }>
    | undefined;
  const review = sections.reviewSchedule as
    { nextReviewDate?: string; triggers?: string } | undefined;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>
          FRIA — {fria.title} (v{fria.version})
        </Text>
        <Text style={styles.meta}>Organization: {fria.org.name}</Text>
        <Text style={styles.meta}>Usecase: {fria.usecase.name}</Text>
        <Text style={styles.meta}>Status: {fria.status}</Text>
        <Text style={styles.meta}>
          Created by: {fria.createdBy.name} ({fria.createdBy.email})
        </Text>
        {fria.submittedBy && (
          <Text style={styles.meta}>
            Submitted by: {fria.submittedBy.name} on{" "}
            {fria.submittedAt?.toISOString().slice(0, 10)}
          </Text>
        )}
        {fria.approvedBy && (
          <Text style={styles.meta}>
            Approved by: {fria.approvedBy.name} on{" "}
            {fria.approvedAt?.toISOString().slice(0, 10)}
          </Text>
        )}

        <Text style={styles.h2}>1. System Identification</Text>
        <Text style={styles.para}>
          <Text style={styles.label}>Name: </Text>
          {system?.name ?? "—"}
        </Text>
        <Text style={styles.para}>
          <Text style={styles.label}>Annex III Category: </Text>
          {system?.annexIIICategory ?? "—"}
        </Text>

        <Text style={styles.h2}>2. Purpose and Intended Use</Text>
        <Text style={styles.para}>{purpose?.description ?? "—"}</Text>
        {purpose?.intendedContext && (
          <Text style={styles.para}>{purpose.intendedContext}</Text>
        )}

        <Text style={styles.h2}>3. Fundamental Rights Assessment</Text>
        <Text style={styles.para}>{describeRights(sections.rights)}</Text>

        <Text style={styles.h2}>4. Governance Controls Mapping</Text>
        <Text style={styles.para}>
          {(sections.governanceControls as string) ?? "—"}
        </Text>

        <Text style={styles.h2}>5. Overall Risk Assessment</Text>
        <Text style={styles.para}>
          <Text style={styles.label}>Rating: </Text>
          {overall?.rating ?? "—"}
        </Text>
        <Text style={styles.para}>{overall?.rationale ?? ""}</Text>

        <Text style={styles.h2}>6. Mitigation Plan</Text>
        {(mitig ?? []).map((m, i) => (
          <Text key={i} style={styles.para}>
            • {m.action} {m.owner ? `(owner: ${m.owner})` : ""}{" "}
            {m.dueDate ? `(due ${m.dueDate})` : ""}{" "}
            {m.status ? `[${m.status}]` : ""}
          </Text>
        ))}

        <Text style={styles.h2}>7. Consultation Record</Text>
        {(
          (sections.consultations as
            | Array<{ stakeholder: string; date?: string; summary?: string }>
            | undefined) ?? []
        ).map((c, i) => (
          <Text key={i} style={styles.para}>
            • {c.stakeholder} {c.date ? `(${c.date})` : ""} — {c.summary ?? ""}
          </Text>
        ))}

        <Text style={styles.h2}>8. Sign-Off</Text>
        <Text style={styles.para}>
          {(sections.signOff as { statement?: string } | undefined)
            ?.statement ?? "—"}
        </Text>

        <Text style={styles.h2}>9. Review and Update</Text>
        <Text style={styles.para}>
          <Text style={styles.label}>Next review: </Text>
          {review?.nextReviewDate ?? "—"}
        </Text>
        <Text style={styles.para}>{review?.triggers ?? ""}</Text>
      </Page>
    </Document>
  );
}

function describeRights(r: unknown): string {
  if (!r || typeof r !== "object") return "—";
  const lines: string[] = [];
  for (const [k, v] of Object.entries(
    r as Record<string, { applicability?: string; residualRisk?: string }>,
  )) {
    const parts: string[] = [k];
    if (v.applicability) parts.push(`applicability=${v.applicability}`);
    if (v.residualRisk) parts.push(`residualRisk=${v.residualRisk}`);
    lines.push(parts.join(" / "));
  }
  return lines.length > 0 ? lines.join("\n") : "—";
}

export async function renderFriaPdf(fria: FriaWithIncludes): Promise<Buffer> {
  return renderToBuffer(<FriaDoc fria={fria} />);
}
