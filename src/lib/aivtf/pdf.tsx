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
  AivtfAssessment,
  AivtfAnswer,
  User,
  AiUsecase,
  Organization,
} from "@/lib/prisma";
import type { CatalogPrinciple } from "./catalog";
import { scorePrinciple, scoreOverall, type AnswerLite } from "./scoring";

export type AivtfWithIncludes = AivtfAssessment & {
  org: Pick<Organization, "id" | "name">;
  usecase: Pick<AiUsecase, "id" | "name"> | null;
  createdBy: Pick<User, "id" | "name" | "email">;
  submittedBy?: Pick<User, "id" | "name" | "email"> | null;
  approvedBy?: Pick<User, "id" | "name" | "email"> | null;
  answers: Pick<AivtfAnswer, "processCode" | "status" | "elaboration">[];
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
  code: { width: 42, fontWeight: 700 },
  stat: { width: 70 },
  body: { flex: 1 },
  small: { fontSize: 8, color: "#666" },
});

const STATUS_LABEL: Record<string, string> = {
  yes: "Yes",
  no: "No",
  na: "N/A",
  unanswered: "—",
};

export function AivtfDoc({
  a,
  catalog,
}: {
  a: AivtfWithIncludes;
  catalog: CatalogPrinciple[];
}) {
  const byCode = new Map(a.answers.map((x) => [x.processCode, x]));
  const principleScores = catalog.map((p) =>
    scorePrinciple(
      p.num,
      p.outcomes
        .flatMap((o) => o.processes)
        .map((pr) => ({
          status: (byCode.get(pr.code)?.status ??
            "unanswered") as AnswerLite["status"],
        })),
    ),
  );
  const overall = scoreOverall(principleScores);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>
          AIVTF Process Checklist — {a.title} (v{a.version})
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

        <Text style={styles.h2}>Summary by principle</Text>
        {catalog.map((p, i) => (
          <View key={p.id} style={styles.rowt}>
            <Text style={styles.code}>{p.num}.</Text>
            <Text style={styles.body}>{p.title}</Text>
            <Text style={styles.stat}>
              {principleScores[i].completionPct}% /{" "}
              {principleScores[i].conformancePct ?? "—"}%
            </Text>
          </View>
        ))}
      </Page>

      {catalog.map((p) => (
        <Page key={p.id} size="A4" style={styles.page} wrap>
          <Text style={styles.h2}>
            {p.num}. {p.title}
          </Text>
          {p.outcomes
            .flatMap((o) => o.processes)
            .map((pr) => {
              const ans = byCode.get(pr.code);
              return (
                <View key={pr.code} style={styles.rowt} wrap={false}>
                  <Text style={styles.code}>{pr.code}</Text>
                  <Text style={styles.stat}>
                    {STATUS_LABEL[ans?.status ?? "unanswered"]}
                  </Text>
                  <View style={styles.body}>
                    <Text>{pr.text}</Text>
                    {pr.evidenceType && (
                      <Text style={styles.small}>
                        Evidence: {pr.evidenceType}
                      </Text>
                    )}
                    {ans?.elaboration && (
                      <Text style={styles.small}>Note: {ans.elaboration}</Text>
                    )}
                  </View>
                </View>
              );
            })}
        </Page>
      ))}
    </Document>
  );
}

export async function renderAivtfPdf(
  a: AivtfWithIncludes,
  catalog: CatalogPrinciple[],
): Promise<Buffer> {
  return renderToBuffer(<AivtfDoc a={a} catalog={catalog} />);
}
