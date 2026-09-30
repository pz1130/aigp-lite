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
  FrtAssessment,
  FrtAnswer,
  User,
  AiUsecase,
  Organization,
} from "@/lib/prisma";
import type { CategoryWithThresholds } from "./catalog";
import {
  scoreCategory,
  scoreOverall,
  tierLabel,
  type AnswerLite,
} from "./scoring";

export type FrtAssessmentWithIncludes = FrtAssessment & {
  org: Pick<Organization, "id" | "name">;
  usecase: Pick<AiUsecase, "id" | "name"> | null;
  createdBy: Pick<User, "id" | "name" | "email">;
  submittedBy?: Pick<User, "id" | "name" | "email"> | null;
  approvedBy?: Pick<User, "id" | "name" | "email"> | null;
  answers: Pick<
    FrtAnswer,
    "thresholdCode" | "status" | "elaboration" | "evidenceRefs"
  >[];
};

// evidenceRefs is persisted as a string[] column; coerce defensively for export.
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
  h3: { fontSize: 10, fontWeight: 700, marginTop: 8, marginBottom: 2 },
  meta: { color: "#555", marginBottom: 3, fontSize: 9 },
  rowt: { flexDirection: "row", marginBottom: 2 },
  code: { width: 110, fontWeight: 700 },
  stat: { width: 50 },
  body: { flex: 1 },
  small: { fontSize: 8, color: "#666" },
});

const STATUS_LABEL: Record<string, string> = {
  met: "Met",
  not_met: "Not met",
  na: "N/A",
  unanswered: "—",
};

function answersFor(
  c: CategoryWithThresholds,
  byCode: Map<string, AnswerLite["status"]>,
): AnswerLite[] {
  return c.thresholds.map((th) => ({
    tier: th.tier,
    status: byCode.get(th.code) ?? "unanswered",
  }));
}

export function FrtDoc({
  a,
  catalog,
}: {
  a: FrtAssessmentWithIncludes;
  catalog: CategoryWithThresholds[];
}) {
  const byCode = new Map(
    a.answers.map((x) => [x.thresholdCode, x.status as AnswerLite["status"]]),
  );
  const ansRow = new Map(a.answers.map((x) => [x.thresholdCode, x]));
  const catScores = new Map(
    catalog.map((c) => [c.code, scoreCategory(c.code, answersFor(c, byCode))]),
  );
  const overall = scoreOverall([...catScores.values()]);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>
          Frontier Risk Tier Assessment — {a.title} (v{a.version})
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
          Overall assigned tier: {tierLabel(overall.assignedTier)} · completion:{" "}
          {overall.completionPct}%
        </Text>

        <Text style={styles.h2}>Summary by category</Text>
        {catalog.map((c) => {
          const sc = catScores.get(c.code)!;
          return (
            <View key={c.code} style={styles.rowt}>
              <Text style={styles.body}>{c.title}</Text>
              <Text style={styles.stat}>{tierLabel(sc.assignedTier)}</Text>
              <Text style={styles.stat}>{sc.completionPct}%</Text>
            </View>
          );
        })}
      </Page>

      {catalog.map((c) => {
        const sc = catScores.get(c.code)!;
        return (
          <Page key={c.id} size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>
              {c.title} — {tierLabel(sc.assignedTier)}
            </Text>
            {[1, 2, 3].map((tier) => {
              const ths = c.thresholds.filter((t) => t.tier === tier);
              if (ths.length === 0) return null;
              return (
                <View key={tier}>
                  <Text style={styles.h3}>Tier {tier}</Text>
                  {ths.map((th) => {
                    const ans = ansRow.get(th.code);
                    return (
                      <View key={th.code} style={styles.rowt} wrap={false}>
                        <Text style={styles.code}>{th.code}</Text>
                        <Text style={styles.stat}>
                          {STATUS_LABEL[ans?.status ?? "unanswered"]}
                        </Text>
                        <View style={styles.body}>
                          <Text>{th.statement}</Text>
                          {th.guidance && (
                            <Text style={styles.small}>
                              Guidance: {th.guidance}
                            </Text>
                          )}
                          {ans?.elaboration && (
                            <Text style={styles.small}>
                              Note: {ans.elaboration}
                            </Text>
                          )}
                          {evidenceList(ans?.evidenceRefs).length > 0 && (
                            <Text style={styles.small}>
                              Evidence:{" "}
                              {evidenceList(ans?.evidenceRefs).join(", ")}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </Page>
        );
      })}
    </Document>
  );
}

export async function renderFrtPdf(
  a: FrtAssessmentWithIncludes,
  catalog: CategoryWithThresholds[],
): Promise<Buffer> {
  return renderToBuffer(<FrtDoc a={a} catalog={catalog} />);
}
