"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DUE_DILIGENCE_CATALOG } from "@/lib/vendor/catalog";
import { hasPermission } from "@/lib/rbac/check";
import type { Role } from "@/lib/rbac/roles";

type Status = "yes" | "partial" | "no" | "not_applicable";

export function VendorDetailClient({
  vendorId,
  role,
}: {
  vendorId: string;
  role: Role;
}) {
  const t = useTranslations("vendor");
  const utils = trpc.useUtils();
  const { data: vendor, isLoading } = trpc.vendor.get.useQuery({ vendorId });
  const usecases = trpc.inventory.list.useQuery();
  const [answers, setAnswers] = useState<Record<string, Status>>({});
  const [linkId, setLinkId] = useState("");
  const [residency, setResidency] = useState<string | null>(null);
  const [renewal, setRenewal] = useState<string | null>(null);
  const [modelNotice, setModelNotice] = useState<boolean | null>(null);

  const canWrite = hasPermission(role, "vendor.write");

  const updateVendor = trpc.vendor.update.useMutation({
    async onSuccess() {
      await utils.vendor.get.invalidate({ vendorId });
      setResidency(null);
      setRenewal(null);
      setModelNotice(null);
    },
  });
  const saveAnswers = trpc.vendor.upsertAnswers.useMutation({
    async onSuccess() {
      await utils.vendor.get.invalidate({ vendorId });
    },
  });
  const link = trpc.vendor.link.useMutation({
    async onSuccess() {
      await utils.vendor.get.invalidate({ vendorId });
    },
  });
  const unlink = trpc.vendor.unlink.useMutation({
    async onSuccess() {
      await utils.vendor.get.invalidate({ vendorId });
    },
  });

  if (isLoading || !vendor)
    return <p className="text-sm text-muted-foreground">…</p>;

  const eff = vendor.ratingOverride ?? vendor.computedRating;
  const existing = new Map(
    vendor.answers.map((a) => [a.itemCode, a.status as Status]),
  );

  function statusFor(code: string): Status {
    return answers[code] ?? existing.get(code) ?? "no";
  }

  const renewalValue =
    renewal ??
    (vendor.contractRenewalDate
      ? new Date(vendor.contractRenewalDate).toISOString().slice(0, 10)
      : "");
  const residencyValue = residency ?? vendor.dataResidency ?? "";
  const modelNoticeValue = modelNotice ?? vendor.modelChangeNotice;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{vendor.name}</h1>
          <p className="text-sm text-muted-foreground">
            {t(`type.${vendor.vendorType}`)}
          </p>
        </div>
        <span className="rounded px-2 py-0.5 text-xs font-medium bg-muted">
          {eff ? t(`rating.${eff}`) : t("unassessed")}
        </span>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">{t("contractSection")}</h2>
        <label className="block space-y-1">
          <span className="text-sm">{t("dataResidency")}</span>
          <Input
            value={residencyValue}
            disabled={!canWrite}
            placeholder={t("dataResidencyPlaceholder")}
            onChange={(e) => setResidency(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">{t("contractRenewalDate")}</span>
          <Input
            type="date"
            value={renewalValue}
            disabled={!canWrite}
            onChange={(e) => setRenewal(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={modelNoticeValue}
            disabled={!canWrite}
            onChange={(e) => setModelNotice(e.target.checked)}
          />
          <span>{t("modelChangeNotice")}</span>
        </label>
        {canWrite && (
          <Button
            disabled={updateVendor.isPending}
            onClick={() =>
              updateVendor.mutate({
                vendorId,
                dataResidency: residencyValue || null,
                contractRenewalDate: renewalValue || null,
                modelChangeNotice: modelNoticeValue,
              })
            }
          >
            {t("save")}
          </Button>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">{t("questionnaire")}</h2>
        {DUE_DILIGENCE_CATALOG.filter((i) =>
          i.appliesTo.includes(vendor.vendorType),
        ).map((item) => (
          <label
            key={item.code}
            className="flex items-start justify-between gap-4 border-b py-2 text-sm"
          >
            <span>
              <span className="font-mono text-xs text-muted-foreground">
                {item.code}
              </span>{" "}
              {item.question}
            </span>
            <select
              className="rounded border border-border-default bg-muted p-1 text-sm"
              disabled={!canWrite}
              value={statusFor(item.code)}
              onChange={(e) =>
                setAnswers({
                  ...answers,
                  [item.code]: e.target.value as Status,
                })
              }
            >
              {(["yes", "partial", "no", "not_applicable"] as Status[]).map(
                (s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ),
              )}
            </select>
          </label>
        ))}
        {canWrite && (
          <Button
            disabled={saveAnswers.isPending}
            onClick={() =>
              saveAnswers.mutate({
                vendorId,
                answers: DUE_DILIGENCE_CATALOG.filter((i) =>
                  i.appliesTo.includes(vendor.vendorType),
                ).map((i) => ({ itemCode: i.code, status: statusFor(i.code) })),
              })
            }
          >
            {t("save")}
          </Button>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t("linkedUsecases")}</h2>
        {vendor.usecases.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("cardEmpty")}</p>
        ) : (
          <ul className="text-sm">
            {vendor.usecases.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between border-b py-1"
              >
                <span>{l.usecase.name}</span>
                {canWrite && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      unlink.mutate({ vendorId, usecaseId: l.usecaseId })
                    }
                  >
                    {t("unlink")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canWrite && (
          <div className="flex items-center gap-2">
            <select
              className="rounded border border-border-default bg-muted p-1 text-sm"
              value={linkId}
              onChange={(e) => setLinkId(e.target.value)}
            >
              <option value="">—</option>
              {(usecases.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!linkId || link.isPending}
              onClick={() => link.mutate({ vendorId, usecaseId: linkId })}
            >
              {t("link")}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
