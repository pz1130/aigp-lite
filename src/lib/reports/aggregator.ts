import { prisma } from "@/lib/db";
import type {
  Control,
  AggregatedControl,
  ReportData,
  ReportTemplate,
  ReportPeriod,
  EvidenceItem,
} from "./types";
import {
  resolvePracticeStatuses,
  type EffectiveStatus,
} from "./practice-status";
import { isFairnessRequired } from "@/lib/fairness/requirement";
import { hasDisparity, type AttributeLite } from "@/lib/fairness/rubric";
import { effectiveRating } from "@/lib/vendor/scoring";

interface AggregateOpts {
  orgId: string;
  period: ReportPeriod;
  template: ReportTemplate;
  generatedBy: { id: string; name: string };
}

async function evaluateControl(
  orgId: string,
  period: ReportPeriod,
  c: Control,
): Promise<{
  status: AggregatedControl["status"];
  evidenceCount: number;
  items: EvidenceItem[];
}> {
  switch (c.dataSource) {
    case "inventory": {
      const count = await prisma.aiUsecase.count({ where: { orgId } });
      const usecases =
        count > 0
          ? await prisma.aiUsecase.findMany({
              where: { orgId },
              take: 5,
              orderBy: { createdAt: "desc" },
            })
          : [];
      return {
        status: count > 0 ? "implemented" : "not-implemented",
        evidenceCount: count,
        items: usecases.map((u) => ({
          kind: "usecase",
          id: u.id,
          ref: u.name,
          capturedAt: u.createdAt,
        })),
      };
    }
    case "policy": {
      const count = await prisma.policy.count({
        where: { orgId, enabled: true },
      });
      return {
        status: count > 0 ? "implemented" : "not-implemented",
        evidenceCount: count,
        items: [],
      };
    }
    case "risk": {
      const inPeriod = await prisma.usecaseRiskAssessment.count({
        where: { orgId, assessedAt: { gte: period.start, lte: period.end } },
      });
      const total = await prisma.usecaseRiskAssessment.count({
        where: { orgId },
      });
      return {
        status:
          inPeriod > 0
            ? "implemented"
            : total > 0
              ? "partial"
              : "not-implemented",
        evidenceCount: inPeriod,
        items: [],
      };
    }
    case "audit": {
      const pattern = (c.query?.actionPrefix as string) ?? "";
      const count = await prisma.auditLog.count({
        where: {
          orgId,
          action: { startsWith: pattern },
          ts: { gte: period.start, lte: period.end },
        },
      });
      return {
        status: count > 0 ? "implemented" : "partial",
        evidenceCount: count,
        items: [],
      };
    }
    case "incident": {
      const count = await prisma.incident.count({
        where: { orgId, openedAt: { gte: period.start, lte: period.end } },
      });
      return { status: "implemented", evidenceCount: count, items: [] };
    }
    case "maturity": {
      const m = await prisma.governanceMaturityAssessment.findFirst({
        where: { orgId, ts: { lte: period.end } },
        orderBy: { ts: "desc" },
      });
      return {
        status:
          (m?.scoreInt ?? 0) >= 3
            ? "implemented"
            : m
              ? "partial"
              : "not-implemented",
        evidenceCount: m ? 1 : 0,
        items: m
          ? [
              {
                kind: "maturity",
                id: m.id,
                ref: `score=${m.scoreInt}`,
                capturedAt: m.ts,
              },
            ]
          : [],
      };
    }
    case "workflow": {
      const count = await prisma.workflowInstance.count({
        where: { orgId, state: "completed" },
      });
      return {
        status: count > 0 ? "implemented" : "not-implemented",
        evidenceCount: count,
        items: [],
      };
    }
    case "evidence": {
      const items = await prisma.evidence.findMany({ where: { orgId } });
      return {
        status: items.length > 0 ? "implemented" : "not-implemented",
        evidenceCount: items.length,
        items: items.map((e) => ({
          kind: "evidence",
          id: e.id,
          ref: e.filename,
          capturedAt: e.uploadedAt,
        })),
      };
    }
    case "data_lineage": {
      const count = await prisma.dataSource.count({ where: { orgId } });
      return {
        status: count > 0 ? "implemented" : "not-implemented",
        evidenceCount: count,
        items: [],
      };
    }
    case "narrative":
      return { status: "implemented", evidenceCount: 0, items: [] };
    case "fria": {
      const frias = await prisma.usecaseFria.findMany({
        where: { orgId },
        orderBy: { version: "desc" },
      });

      if (frias.length === 0) {
        return { status: "not-implemented", evidenceCount: 0, items: [] };
      }

      const usecaseIds = [...new Set(frias.map((f) => f.usecaseId))];
      const highRiskUsecases: string[] = [];
      const approvedForHighRisk: string[] = [];

      for (const uid of usecaseIds) {
        const current = frias.find(
          (f) => f.usecaseId === uid && f.status !== "archived",
        );
        if (!current) continue;

        const sections =
          (current.sectionsJson as Record<string, unknown>) ?? {};
        const system = sections.system as Record<string, unknown> | undefined;
        const annexCat = system?.annexIIICategory as string | undefined;

        if (annexCat == null || annexCat === "not_high_risk") continue;

        highRiskUsecases.push(uid);
        if (current.status === "approved") {
          approvedForHighRisk.push(uid);
        }
      }

      if (highRiskUsecases.length === 0) {
        return { status: "n/a", evidenceCount: frias.length, items: [] };
      }

      const allApproved =
        highRiskUsecases.length === approvedForHighRisk.length;
      const someApproved = approvedForHighRisk.length > 0;
      const status = allApproved
        ? "implemented"
        : someApproved
          ? "partial"
          : "not-implemented";

      const items: EvidenceItem[] = frias
        .filter(
          (f) =>
            highRiskUsecases.includes(f.usecaseId) && f.status !== "archived",
        )
        .slice(0, 10)
        .map((f) => ({
          kind: "fria",
          id: f.id,
          ref: f.title,
          capturedAt: f.updatedAt,
        }));

      return { status, evidenceCount: frias.length, items };
    }

    case "eu_obligation": {
      const code = c.query?.obligationCode as string | undefined;
      if (!code) return { status: "n/a", evidenceCount: 0, items: [] };

      // 1. Resolve the obligation control in the EU_AI_ACT framework
      const control = await prisma.riskControl.findFirst({
        where: { code, framework: { code: "EU_AI_ACT" } },
        select: { id: true },
      });
      if (!control) return { status: "n/a", evidenceCount: 0, items: [] };

      // 2. Status: aggregate per-usecase control status across the org
      const rows = await prisma.usecaseControlStatus.findMany({
        where: { orgId, controlId: control.id },
        select: { status: true },
      });
      const relevant = rows.filter((r) => r.status !== "not_applicable");
      const satisfied = relevant.filter((r) => r.status === "satisfied").length;
      const someProgress = relevant.some(
        (r) => r.status === "in_progress" || r.status === "satisfied",
      );

      let status: AggregatedControl["status"];
      if (relevant.length === 0)
        status = rows.length > 0 ? "n/a" : "not-implemented";
      else if (satisfied === relevant.length) status = "implemented";
      else if (someProgress) status = "partial";
      else status = "not-implemented";

      // 3. Evidence: EU_AI_ACT catalog risks this obligation mitigates,
      //    linked to org usecases (traceability only; does not affect status)
      const mitigations = await prisma.riskCatalogMitigation.findMany({
        where: { controlId: control.id, risk: { source: "EU_AI_ACT" } },
        select: { riskCatalogId: true },
      });
      const riskIds = mitigations.map((m) => m.riskCatalogId);

      const links =
        riskIds.length === 0
          ? []
          : await prisma.usecaseCatalogRiskLink.findMany({
              where: { orgId, riskCatalogId: { in: riskIds } },
              select: {
                id: true,
                acceptedAt: true,
                risk: { select: { code: true, title: true } },
              },
              orderBy: { acceptedAt: "desc" },
              take: 10,
            });

      const items: EvidenceItem[] = links.map((l) => ({
        kind: "catalog_risk",
        id: l.id,
        ref: `${l.risk.code} — ${l.risk.title}`,
        capturedAt: l.acceptedAt,
      }));

      // 4. NeMo guardrail evidence for this obligation (additive; does not
      //    affect status or evidenceCount)
      const nemoEvidence = await prisma.nemoGuardrailEvidence.findMany({
        where: { orgId, obligationCode: code },
        orderBy: { capturedAt: "desc" },
        take: 5,
      });
      const nemoItems: EvidenceItem[] = nemoEvidence.map((n) => ({
        kind: "nemo_guardrail",
        id: n.id,
        ref: `${n.configRef} (approval gate: ${n.approvalGatePassed ? "pass" : "fail"}, kill switch: ${n.killSwitchPassed ? "pass" : "fail"})`,
        capturedAt: n.capturedAt,
      }));

      return {
        status,
        evidenceCount: satisfied,
        items: [...items, ...nemoItems],
      };
    }

    case "mindforge_consideration": {
      const cc = c.query?.considerationCode as string | undefined;
      if (!cc) return { status: "n/a", evidenceCount: 0, items: [] };

      const controls = await prisma.riskControl.findMany({
        where: {
          framework: { code: "MINDFORGE" },
          code: { startsWith: `${cc}-` },
        },
        select: { id: true, code: true },
      });
      if (controls.length === 0)
        return { status: "n/a", evidenceCount: 0, items: [] };
      const controlIds = controls.map((x) => x.id);
      const codeById = new Map(controls.map((x) => [x.id, x.code]));

      const effective: EffectiveStatus[] = [];
      const crosswalkItems: EvidenceItem[] = [];
      for (const ctl of controls) {
        const statuses = await resolvePracticeStatuses(orgId, ctl.id);
        effective.push(...statuses);
        for (const s of statuses) {
          if (s.source === "inherited" && s.inheritedFrom) {
            crosswalkItems.push({
              kind: "crosswalk",
              id: `${ctl.id}:${s.usecaseId}`,
              ref: `${ctl.code} ⇐ ${s.inheritedFrom.framework} ${s.inheritedFrom.code} (${s.status})`,
              capturedAt: new Date(),
            });
          }
        }
      }

      const relevant = effective.filter((r) => r.status !== "not_applicable");

      const usecaseIds = [...new Set(relevant.map((r) => r.usecaseId))];
      const mats =
        usecaseIds.length === 0
          ? []
          : await prisma.usecaseMateriality.findMany({
              where: { orgId, usecaseId: { in: usecaseIds } },
              select: {
                usecaseId: true,
                computedTier: true,
                tierOverride: true,
              },
            });
      const tierByUsecase = new Map(
        mats.map((m) => [m.usecaseId, m.tierOverride ?? m.computedTier]),
      );

      const satisfied = relevant.filter((r) => r.status === "satisfied").length;
      const someProgress = relevant.some(
        (r) => r.status === "in_progress" || r.status === "satisfied",
      );

      const materialRows = relevant.filter((r) => {
        const tier = tierByUsecase.get(r.usecaseId);
        return tier === "high" || tier === "critical";
      });
      const materialUnsatisfied = materialRows.filter(
        (r) => r.status !== "satisfied",
      );

      let status: AggregatedControl["status"];
      if (relevant.length === 0) {
        status = effective.length > 0 ? "n/a" : "not-implemented";
      } else if (materialRows.length > 0) {
        if (materialUnsatisfied.length === 0) status = "implemented";
        else if (someProgress) status = "partial";
        else status = "not-implemented";
      } else {
        if (satisfied === relevant.length) status = "implemented";
        else if (someProgress) status = "partial";
        else status = "not-implemented";
      }

      const relatedXwalks = await prisma.controlCrosswalk.findMany({
        where: { sourceControlId: { in: controlIds }, relation: "related" },
        select: {
          sourceControlId: true,
          target: {
            select: { code: true, framework: { select: { code: true } } },
          },
        },
      });
      for (const x of relatedXwalks) {
        crosswalkItems.push({
          kind: "crosswalk",
          id: `rel:${x.sourceControlId}:${x.target.framework.code}:${x.target.code}`,
          ref: `${codeById.get(x.sourceControlId)} ~ ${x.target.framework.code} ${x.target.code} (related)`,
          capturedAt: new Date(),
        });
      }

      const mitigations = await prisma.riskCatalogMitigation.findMany({
        where: { controlId: { in: controlIds }, risk: { source: "MINDFORGE" } },
        select: { riskCatalogId: true },
      });
      const riskIds = [...new Set(mitigations.map((m) => m.riskCatalogId))];

      const links =
        riskIds.length === 0
          ? []
          : await prisma.usecaseCatalogRiskLink.findMany({
              where: { orgId, riskCatalogId: { in: riskIds } },
              select: {
                id: true,
                acceptedAt: true,
                risk: { select: { code: true, title: true } },
              },
              orderBy: { acceptedAt: "desc" },
              take: 10,
            });

      const riskItems: EvidenceItem[] = links.map((l) => ({
        kind: "catalog_risk",
        id: l.id,
        ref: `${l.risk.code} — ${l.risk.title}`,
        capturedAt: l.acceptedAt,
      }));

      const gatingItems: EvidenceItem[] = [];
      if (materialUnsatisfied.length > 0) {
        const blockIds = [
          ...new Set(materialUnsatisfied.map((r) => r.usecaseId)),
        ];
        const names = await prisma.aiUsecase.findMany({
          where: { orgId, id: { in: blockIds } },
          select: { id: true, name: true },
        });
        const nameById = new Map(names.map((n) => [n.id, n.name]));
        for (const r of materialUnsatisfied.slice(0, 10)) {
          gatingItems.push({
            kind: "materiality_gap",
            id: r.usecaseId,
            ref: `${nameById.get(r.usecaseId) ?? r.usecaseId} (${tierByUsecase.get(r.usecaseId)}) — ${r.status}`,
            capturedAt: new Date(),
          });
        }
      }

      const items = [...crosswalkItems, ...gatingItems, ...riskItems].slice(
        0,
        10,
      );

      return { status, evidenceCount: satisfied, items };
    }

    case "fairness_assessment": {
      const usecases = await prisma.aiUsecase.findMany({
        where: { orgId, lifecycleStage: { in: ["development", "production"] } },
        select: { id: true, name: true },
      });
      const ids = usecases.map((u) => u.id);
      if (ids.length === 0)
        return { status: "n/a" as const, evidenceCount: 0, items: [] };

      const materiality = await prisma.usecaseMateriality.findMany({
        where: { orgId, usecaseId: { in: ids } },
        select: { usecaseId: true, computedTier: true, tierOverride: true },
      });
      const matById = new Map(materiality.map((m) => [m.usecaseId, m]));

      const required = usecases.filter((u) =>
        isFairnessRequired(matById.get(u.id) ?? null),
      );
      if (required.length === 0)
        return { status: "n/a" as const, evidenceCount: 0, items: [] };

      const requiredIds = required.map((u) => u.id);
      const assessments = await prisma.usecaseFairnessAssessment.findMany({
        where: { orgId, usecaseId: { in: requiredIds } },
        include: { attributes: { include: { subgroups: true } } },
      });
      const byUsecase = new Map(assessments.map((a) => [a.usecaseId, a]));

      let satisfied = 0;
      const items: EvidenceItem[] = [];
      for (const u of required) {
        const a = byUsecase.get(u.id);
        const attrs: AttributeLite[] = a
          ? a.attributes.map((at) => ({
              name: at.name,
              metric: at.metric,
              subgroups: at.subgroups.map((s) => ({
                label: s.label,
                value: s.value,
              })),
            }))
          : [];
        const ok =
          a != null && a.status === "completed" && !hasDisparity(attrs);
        if (ok) {
          satisfied++;
          items.push({
            kind: "fairness_assessment",
            id: a!.id,
            ref: `${u.name}: fairness assessment complete`,
            capturedAt: a!.completedAt ?? a!.updatedAt,
          });
        } else {
          const reason =
            a == null
              ? "no fairness assessment"
              : a.status !== "completed"
                ? "assessment in draft"
                : "disparity detected";
          items.push({
            kind: "fairness_gap",
            id: u.id,
            ref: `${u.name}: ${reason}`,
            capturedAt: new Date(0),
          });
        }
      }

      let status: AggregatedControl["status"];
      if (satisfied === required.length) status = "implemented";
      else if (satisfied === 0) status = "not-implemented";
      else status = "partial";

      return { status, evidenceCount: satisfied, items };
    }

    case "vendor_due_diligence": {
      const inScope = await prisma.aiUsecase.findMany({
        where: { orgId, lifecycleStage: { in: ["development", "production"] } },
        select: { id: true, name: true },
      });
      const ids = inScope.map((u) => u.id);
      const nameById = new Map(inScope.map((u) => [u.id, u.name]));

      const links =
        ids.length === 0
          ? []
          : await prisma.vendorUsecaseLink.findMany({
              where: { orgId, usecaseId: { in: ids } },
              select: { vendorId: true, usecaseId: true },
            });

      if (links.length === 0) {
        return { status: "n/a" as const, evidenceCount: 0, items: [] };
      }

      const vendorIds = Array.from(new Set(links.map((l) => l.vendorId)));
      const vendors = await prisma.vendor.findMany({
        where: { orgId, id: { in: vendorIds } },
        select: {
          id: true,
          name: true,
          computedRating: true,
          ratingOverride: true,
          assessedAt: true,
        },
      });
      const exampleUsecase = new Map<string, string>();
      for (const l of links) {
        if (!exampleUsecase.has(l.vendorId)) {
          exampleUsecase.set(l.vendorId, nameById.get(l.usecaseId) ?? "");
        }
      }

      let vetted = 0;
      const blocking: typeof vendors = [];
      for (const v of vendors) {
        const eff = effectiveRating(v);
        const isBlocking = eff == null || eff === "high" || eff === "critical";
        if (eff != null && eff !== "high" && eff !== "critical") vetted++;
        if (isBlocking) blocking.push(v);
      }

      let status: AggregatedControl["status"];
      if (blocking.length === 0) status = "implemented";
      else if (vetted === 0) status = "not-implemented";
      else status = "partial";

      const items: EvidenceItem[] = blocking.slice(0, 10).map((v) => {
        const eff = effectiveRating(v);
        const uc = exampleUsecase.get(v.id) ?? "";
        return {
          kind: "vendor_due_diligence",
          id: v.id,
          ref: `${v.name} (${eff ?? "un-assessed"}) — relied on by ${uc}`,
          capturedAt: v.assessedAt ?? new Date(0),
        };
      });

      return { status, evidenceCount: vetted, items };
    }
  }
}

export async function aggregate(opts: AggregateOpts): Promise<ReportData> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: opts.orgId },
  });
  const aggregated: AggregatedControl[] = [];
  for (const c of opts.template.controls) {
    const result = await evaluateControl(opts.orgId, opts.period, c);
    aggregated.push({
      ...c,
      status: result.status,
      evidenceCount: result.evidenceCount,
      evidenceItems: result.items,
    });
  }

  const summary = aggregated.reduce(
    (acc, c) => {
      acc.total++;
      if (c.status === "implemented") acc.implemented++;
      else if (c.status === "partial") acc.partial++;
      else if (c.status === "not-implemented") acc.notImplemented++;
      else acc.na++;
      return acc;
    },
    { total: 0, implemented: 0, partial: 0, notImplemented: 0, na: 0 },
  );

  const incidents = await prisma.incident.findMany({
    where: {
      orgId: opts.orgId,
      openedAt: { gte: opts.period.start, lte: opts.period.end },
    },
    take: 50,
    orderBy: { openedAt: "desc" },
  });
  const auditHighlights = await prisma.auditLog.findMany({
    where: {
      orgId: opts.orgId,
      ts: { gte: opts.period.start, lte: opts.period.end },
      action: {
        in: [
          "policy.update",
          "provider.connection.create",
          "policy.change",
          "usecase.lifecycle.change",
        ],
      },
    },
    take: 25,
    orderBy: { ts: "desc" },
  });

  let data: ReportData = {
    template: opts.template,
    period: opts.period,
    org: { id: org.id, name: org.name },
    generatedAt: new Date(),
    generatedBy: opts.generatedBy,
    controls: aggregated,
    summary,
    incidents: incidents.map((i) => ({
      id: i.id,
      openedAt: i.openedAt,
      severity: i.severity,
      status: i.status,
      title: i.title,
    })),
    auditHighlights: auditHighlights.map((a) => ({
      id: a.id,
      action: a.action,
      resourceType: a.resourceType,
      createdAt: a.ts,
      actor: a.actorId ?? undefined,
    })),
  };

  if (opts.template.enrich) data = await opts.template.enrich(data, prisma);
  return data;
}
