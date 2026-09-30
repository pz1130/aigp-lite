import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type {
  MfChecklistAssessment,
  MfChecklistAnswer,
  User,
  AiUsecase,
  Organization,
} from "@/lib/prisma";
import type { CatalogSection } from "./catalog";
import { scoreConsideration, scoreOverall, type AnswerLite } from "./scoring";

export type MfChecklistWithIncludes = MfChecklistAssessment & {
  org: Pick<Organization, "id" | "name">;
  usecase: Pick<AiUsecase, "id" | "name"> | null;
  createdBy: Pick<User, "id" | "name" | "email">;
  submittedBy?: Pick<User, "id" | "name" | "email"> | null;
  approvedBy?: Pick<User, "id" | "name" | "email"> | null;
  answers: Pick<
    MfChecklistAnswer,
    "itemCode" | "status" | "elaboration" | "evidenceRefs"
  >[];
};

// evidenceRefs is persisted as JSON (string[]); coerce defensively for export.
export function evidenceList(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];
}

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
  h3: { fontSize: 10, fontWeight: 700, marginTop: 8, marginBottom: 3 },
  meta: { color: "#555", marginBottom: 3, fontSize: 9 },
  rowt: { flexDirection: "row", marginBottom: 2 },
  code: { width: 48, fontWeight: 700 },
  stat: { width: 40 },
  body: { flex: 1 },
  small: { fontSize: 8, color: "#666" },
});

const STATUS_LABEL: Record<string, string> = {
  yes: "Yes",
  no: "No",
  na: "N/A",
  unanswered: "—",
};

export function MfChecklistDoc({
  a,
  catalog,
}: {
  a: MfChecklistWithIncludes;
  catalog: CatalogSection[];
}) {
  const byCode = new Map(a.answers.map((x) => [x.itemCode, x]));
  const considerationScores = new Map(
    catalog.flatMap((s) =>
      s.considerations.map(
        (c) =>
          [
            c.code,
            scoreConsideration(
              c.code,
              c.items.map((it) => ({
                status: (byCode.get(it.code)?.status ??
                  "unanswered") as AnswerLite["status"],
              })),
            ),
          ] as const,
      ),
    ),
  );
  const overall = scoreOverall([...considerationScores.values()]);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>
          MindForge Appendix H Checklist — {a.title} (v{a.version})
        </Text>
        <Text style={styles.meta}>Organization: {a.org.name}</Text>
        <Text style={styles.meta}>
          Scope:{" "}
          {a.usecase ? `Usecase — ${a.usecase.name}` : "Organization-level"}
        </Text>
        <Text style={styles.meta}>Status: {a.status}</Text>
        <Text style={styles.meta}>
          Created by: {a.createdBy.name} ({a.createdBy.email})
        </Text>
        {a.approvedBy && (
          <Text style={styles.meta}>
            Approved by: {a.approvedBy.name} on{" "}
            {a.approvedAt?.toISOString().slice(0, 10)}
          </Text>
        )}
        <Text style={styles.meta}>
          Overall completion: {overall.completionPct}% · conformance:{" "}
          {overall.conformancePct ?? "—"}%
        </Text>

        <Text style={styles.h2}>Summary by consideration</Text>
        {catalog
          .flatMap((s) => s.considerations)
          .map((c) => {
            const sc = considerationScores.get(c.code)!;
            return (
              <View key={c.code} style={styles.rowt}>
                <Text style={styles.code}>{c.code}</Text>
                <Text style={styles.body}>{c.title}</Text>
                <Text style={styles.stat}>
                  {sc.completionPct}% / {sc.conformancePct ?? "—"}%
                </Text>
              </View>
            );
          })}
      </Page>

      {catalog.map((s) => (
        <Page key={s.id} size="A4" style={styles.page} wrap>
          <Text style={styles.h2}>
            {s.num}. {s.title}
          </Text>
          {s.considerations.map((c) => (
            <View key={c.code} wrap={false}>
              <Text style={styles.h3}>
                {c.code} — {c.title}
              </Text>
              {c.items.map((it) => {
                const ans = byCode.get(it.code);
                return (
                  <View key={it.code} style={styles.rowt} wrap={false}>
                    <Text style={styles.code}>{it.code}</Text>
                    <Text style={styles.stat}>
                      {STATUS_LABEL[ans?.status ?? "unanswered"]}
                    </Text>
                    <View style={styles.body}>
                      <Text>{it.text}</Text>
                      {it.guidance && (
                        <Text style={styles.small}>
                          Guidance: {it.guidance}
                        </Text>
                      )}
                      {ans?.elaboration && (
                        <Text style={styles.small}>
                          Note: {ans.elaboration}
                        </Text>
                      )}
                      {evidenceList(ans?.evidenceRefs).length > 0 && (
                        <Text style={styles.small}>
                          Evidence: {evidenceList(ans?.evidenceRefs).join(", ")}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </Page>
      ))}
    </Document>
  );
}

export async function renderMfChecklistPdf(
  a: MfChecklistWithIncludes,
  catalog: CatalogSection[],
): Promise<Buffer> {
  return renderToBuffer(<MfChecklistDoc a={a} catalog={catalog} />);
}
