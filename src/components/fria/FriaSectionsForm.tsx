"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { FRIA_RIGHT_KEYS, type FriaSections } from "@/lib/fria/sections-schema";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const ANNEX_III = [
  "biometrics",
  "critical_infrastructure",
  "education",
  "employment",
  "essential_services",
  "law_enforcement",
  "migration",
  "justice",
  "not_high_risk",
] as const;

const RIGHT_APPLICABILITY = [
  "applicable",
  "not_applicable",
  "unclear",
] as const;
const RIGHT_RESIDUAL = ["low", "medium", "high"] as const;
const OVERALL_RATING = ["low", "medium", "high", "critical"] as const;

type FriaRightKey = (typeof FRIA_RIGHT_KEYS)[number];
type FriaRightAssessment = NonNullable<
  NonNullable<FriaSections["rights"]>[FriaRightKey]
>;

export function FriaSectionsForm({
  friaId,
  initial,
  readOnly,
}: {
  friaId: string;
  initial: FriaSections;
  readOnly: boolean;
}) {
  const t = useTranslations("fria");
  const [sections, setSections] = useState<FriaSections>(initial);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const update = trpc.fria.updateSections.useMutation();

  useEffect(() => {
    if (readOnly) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await update.mutateAsync({ id: friaId, sections });
        setSavedAt(new Date());
      } catch {
        /* surface via update.error below */
      }
    }, 2000);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [sections, friaId, readOnly]);

  function setSystem<K extends keyof NonNullable<FriaSections["system"]>>(
    k: K,
    v: NonNullable<FriaSections["system"]>[K],
  ) {
    setSections((s) => ({
      ...s,
      system: { ...s.system, [k]: v } as FriaSections["system"],
    }));
  }

  // v4 infers z.record(z.enum(...), ...) as a Partial record, so spreading the
  // computed key widens each value to `| undefined`; the cast localizes that.
  function setRight(rk: FriaRightKey, patch: Partial<FriaRightAssessment>) {
    setSections((s) => ({
      ...s,
      rights: {
        ...s.rights,
        [rk]: { ...(s.rights?.[rk] ?? {}), ...patch },
      } as FriaSections["rights"],
    }));
  }

  return (
    <div className="space-y-8">
      {!readOnly && (
        <div className="text-xs text-tertiary">
          {update.isPending
            ? t("saving")
            : savedAt
              ? `${t("saved")} ${savedAt.toLocaleTimeString()}`
              : ""}
        </div>
      )}

      <section>
        <h3 className="font-semibold mb-3">{t("sections.system")}</h3>
        <label className="block text-sm mb-2">
          System name
          <Input
            value={sections.system?.name ?? ""}
            onChange={(e) => setSystem("name", e.target.value)}
            disabled={readOnly}
            maxLength={200}
            required
          />
        </label>
        <label className="block text-sm mb-2">
          Annex III Category
          <Select
            value={sections.system?.annexIIICategory ?? ""}
            onValueChange={(v) =>
              setSystem(
                "annexIIICategory",
                (v || undefined) as NonNullable<
                  FriaSections["system"]
                >["annexIIICategory"],
              )
            }
            disabled={readOnly}
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {ANNEX_III.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </section>

      <section>
        <h3 className="font-semibold mb-3">{t("sections.purpose")}</h3>
        <Textarea
          value={sections.purpose?.description ?? ""}
          onChange={(e) =>
            setSections((s) => ({
              ...s,
              purpose: { ...s.purpose, description: e.target.value },
            }))
          }
          disabled={readOnly}
          rows={3}
          maxLength={3000}
          aria-label="Purpose description"
        />
      </section>

      <section>
        <h3 className="font-semibold mb-3">{t("sections.rights")}</h3>
        <div className="space-y-3">
          {FRIA_RIGHT_KEYS.map((rk) => {
            const r = sections.rights?.[rk] ?? {};
            return (
              <details
                key={rk}
                className="rounded-md border border-border-default p-3"
              >
                <summary className="cursor-pointer text-sm font-medium">
                  {t(`rights.${rk}`)}
                </summary>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-secondary">
                      Applicability
                    </span>
                    <Select
                      value={r.applicability ?? ""}
                      onValueChange={(v) =>
                        setRight(rk, {
                          applicability: (v ||
                            undefined) as FriaRightAssessment["applicability"],
                        })
                      }
                      disabled={readOnly}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {RIGHT_APPLICABILITY.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Textarea
                    placeholder="Potential impact"
                    value={r.potentialImpact ?? ""}
                    disabled={readOnly}
                    rows={2}
                    onChange={(e) =>
                      setRight(rk, { potentialImpact: e.target.value })
                    }
                    aria-label="Potential impact"
                  />
                  <Textarea
                    placeholder="Affected groups"
                    value={r.affectedGroups ?? ""}
                    disabled={readOnly}
                    rows={2}
                    onChange={(e) =>
                      setRight(rk, { affectedGroups: e.target.value })
                    }
                    aria-label="Affected groups"
                  />
                  <Textarea
                    placeholder="Mitigations"
                    value={r.mitigations ?? ""}
                    disabled={readOnly}
                    rows={2}
                    onChange={(e) =>
                      setRight(rk, { mitigations: e.target.value })
                    }
                    aria-label="Mitigations"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-secondary">
                      Residual risk
                    </span>
                    <Select
                      value={r.residualRisk ?? ""}
                      onValueChange={(v) =>
                        setRight(rk, {
                          residualRisk: (v ||
                            undefined) as FriaRightAssessment["residualRisk"],
                        })
                      }
                      disabled={readOnly}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {RIGHT_RESIDUAL.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="font-semibold mb-3">
          {t("sections.governanceControls")}
        </h3>
        <Textarea
          value={sections.governanceControls ?? ""}
          onChange={(e) =>
            setSections((s) => ({ ...s, governanceControls: e.target.value }))
          }
          disabled={readOnly}
          rows={4}
          maxLength={5000}
          aria-label="Governance controls"
        />
      </section>

      <section>
        <h3 className="font-semibold mb-3">{t("sections.overallRisk")}</h3>
        <label className="block text-sm mb-2">
          Rating
          <Select
            value={sections.overallRisk?.rating ?? ""}
            onValueChange={(v) =>
              setSections((s) => ({
                ...s,
                overallRisk: {
                  ...s.overallRisk,
                  rating: (v || undefined) as NonNullable<
                    FriaSections["overallRisk"]
                  >["rating"],
                },
              }))
            }
            disabled={readOnly}
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {OVERALL_RATING.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <Textarea
          placeholder="Rationale"
          value={sections.overallRisk?.rationale ?? ""}
          onChange={(e) =>
            setSections((s) => ({
              ...s,
              overallRisk: { ...s.overallRisk, rationale: e.target.value },
            }))
          }
          disabled={readOnly}
          rows={3}
          maxLength={3000}
          aria-label="Rationale"
        />
      </section>

      <section>
        <h3 className="font-semibold mb-3">{t("sections.mitigationPlan")}</h3>
        <p className="text-xs text-tertiary">
          Use the textarea below to draft actions (one per line). v2 will add
          structured rows.
        </p>
        <Textarea
          value={(sections.mitigationPlan ?? [])
            .map((m) => m.action)
            .join("\n")}
          onChange={(e) =>
            setSections((s) => ({
              ...s,
              mitigationPlan: e.target.value
                .split("\n")
                .filter((l) => l.trim().length > 0)
                .map((action) => ({ action })),
            }))
          }
          disabled={readOnly}
          rows={4}
          aria-label="Mitigation plan"
        />
      </section>

      <section>
        <h3 className="font-semibold mb-3">{t("sections.consultations")}</h3>
        <Textarea
          placeholder="One stakeholder per line"
          value={(sections.consultations ?? [])
            .map((c) => c.stakeholder)
            .join("\n")}
          onChange={(e) =>
            setSections((s) => ({
              ...s,
              consultations: e.target.value
                .split("\n")
                .filter((l) => l.trim().length > 0)
                .map((stakeholder) => ({ stakeholder })),
            }))
          }
          disabled={readOnly}
          rows={3}
          aria-label="Stakeholders"
        />
      </section>

      <section>
        <h3 className="font-semibold mb-3">{t("sections.signOff")}</h3>
        <Textarea
          value={sections.signOff?.statement ?? ""}
          onChange={(e) =>
            setSections((s) => ({
              ...s,
              signOff: { statement: e.target.value },
            }))
          }
          disabled={readOnly}
          rows={3}
          maxLength={2000}
          aria-label="Sign-off statement"
        />
      </section>

      <section>
        <h3 className="font-semibold mb-3">{t("sections.reviewSchedule")}</h3>
        <label className="block text-sm mb-2">
          Next review date
          <Input
            type="date"
            value={sections.reviewSchedule?.nextReviewDate ?? ""}
            onChange={(e) =>
              setSections((s) => ({
                ...s,
                reviewSchedule: {
                  ...s.reviewSchedule,
                  nextReviewDate: e.target.value,
                },
              }))
            }
            disabled={readOnly}
          />
        </label>
        <Textarea
          placeholder="Triggers for early review"
          value={sections.reviewSchedule?.triggers ?? ""}
          onChange={(e) =>
            setSections((s) => ({
              ...s,
              reviewSchedule: { ...s.reviewSchedule, triggers: e.target.value },
            }))
          }
          disabled={readOnly}
          rows={2}
          maxLength={2000}
          aria-label="Triggers for early review"
        />
      </section>
    </div>
  );
}
