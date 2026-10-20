"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { TrustPublicView } from "@/components/trust-center/PublicView";
import type { TrustPublicPayload } from "@/lib/trust-center/aggregate";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPublicPayload(value: unknown): value is TrustPublicPayload {
  if (!isRecord(value)) return false;
  return (
    isRecord(value.org) &&
    Array.isArray(value.frameworks) &&
    Array.isArray(value.systems) &&
    isRecord(value.redteam) &&
    Array.isArray(value.transparencyReports) &&
    isRecord(value.sbom)
  );
}

function TwinDraftPreview({
  snapshotId,
  displayName,
  contactEmail,
}: {
  snapshotId: string;
  displayName: string;
  contactEmail: string | null;
}) {
  const t = useTranslations("trustCenter.admin");
  const tPublic = useTranslations("trustCenter.public");
  const snapshotQuery = trpc.trustCenter.getSnapshot.useQuery({
    id: snapshotId,
  });
  const snapshot = snapshotQuery.data;
  if (!snapshot) return null;

  const publicPayload = isPublicPayload(snapshot.publicPayload)
    ? snapshot.publicPayload
    : null;
  const version = snapshot.version ?? 0;
  const publishedAt = snapshot.publishedAt;
  const publishedDate = publishedAt
    ? publishedAt.toISOString().slice(0, 10)
    : "—";

  return (
    <section className="space-y-6">
      {publicPayload ? (
        <div className="rounded border">
          <h3 className="border-b px-4 py-2 text-sm font-medium">
            {t("previewPublic")}
          </h3>
          <TrustPublicView
            displayName={displayName}
            contactEmail={contactEmail}
            version={version}
            publishedAt={publishedAt}
            payload={publicPayload}
            labels={{
              heading: tPublic("heading"),
              dataAsOf: tPublic("dataAsOf", {
                date: publishedDate,
                version,
              }),
              frameworks: tPublic("frameworks"),
              systems: tPublic("systems"),
              goLivePassed: tPublic("goLivePassed"),
              goLivePending: tPublic("goLivePending"),
              redteam: tPublic("redteam"),
              redteamSummary:
                publicPayload.redteam.attestationCount > 0
                  ? tPublic("redteamCount", {
                      count: publicPayload.redteam.attestationCount,
                      date: (
                        publicPayload.redteam.latestAttestationAt ?? ""
                      ).slice(0, 10),
                    })
                  : tPublic("redteamNone"),
              transparency: tPublic("transparency"),
              sbom: tPublic("sbom"),
              sbomStatus: publicPayload.sbom.available
                ? tPublic("sbomAvailable", {
                    count: publicPayload.sbom.componentCount,
                  })
                : tPublic("sbomUnavailable"),
              contact: contactEmail
                ? tPublic("contact", { email: contactEmail })
                : null,
            }}
          />
        </div>
      ) : null}
    </section>
  );
}

export function TrustCenterAdminClient() {
  const t = useTranslations("trustCenter.admin");
  const utils = trpc.useUtils();

  const profileQuery = trpc.trustCenter.getProfile.useQuery();
  const snapshots = trpc.trustCenter.listSnapshots.useQuery();
  const usecases = trpc.inventory.list.useQuery();

  const [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [formHydrated, setFormHydrated] = useState(false);
  const [form, setForm] = useState({
    slug: "",
    displayName: "",
    intro: "",
    contactEmail: "",
    enabled: false,
  });

  useEffect(() => {
    const p = profileQuery.data?.profile;
    if (!p || formHydrated) return;
    setForm({
      slug: p.slug,
      displayName: p.displayName,
      intro: p.intro,
      contactEmail: p.contactEmail ?? "",
      enabled: p.enabled,
    });
    setFormHydrated(true);
  }, [profileQuery.data, formHydrated]);

  useEffect(() => {
    if (previewId) return;
    const draft = (snapshots.data ?? []).find((s) => s.status === "draft");
    if (draft) setPreviewId(draft.id);
  }, [snapshots.data, previewId]);

  const invalidateAll = () => {
    void utils.trustCenter.getProfile.invalidate();
    void utils.trustCenter.listSnapshots.invalidate();
    void utils.trustCenter.listTokens.invalidate();
    void utils.trustCenter.getSnapshot.invalidate();
  };

  const saveProfile = trpc.trustCenter.saveProfile.useMutation({
    onSuccess: invalidateAll,
  });
  const createDraft = trpc.trustCenter.createDraft.useMutation({
    onSuccess: (draft) => {
      setPreviewId(draft.id);
      invalidateAll();
    },
  });
  const publish = trpc.trustCenter.publish.useMutation({
    onSuccess: invalidateAll,
  });
  const withdraw = trpc.trustCenter.withdraw.useMutation({
    onSuccess: invalidateAll,
  });
  const deleteDraft = trpc.trustCenter.deleteDraft.useMutation({
    onSuccess: (_data, vars) => {
      if (previewId === vars.id) setPreviewId(null);
      invalidateAll();
    },
  });
  const contactEmail = form.contactEmail === "" ? null : form.contactEmail;

  return (
    <div className="space-y-10">
      {profileQuery.data?.stale ? (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          {t("staleBanner")}
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t("profileHeading")}</h2>
        <Input
          placeholder={t("slug")}
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
        />
        <Input
          placeholder={t("displayName")}
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
        />
        <Textarea
          placeholder={t("intro")}
          value={form.intro}
          onChange={(e) => setForm({ ...form, intro: e.target.value })}
        />
        <Input
          placeholder={t("contactEmail")}
          value={form.contactEmail}
          onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
        />
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={form.enabled}
            onCheckedChange={(enabled) => setForm({ ...form, enabled })}
          />
          {t("enabled")}
        </label>
        <Button
          onClick={() =>
            saveProfile.mutate({
              slug: form.slug,
              displayName: form.displayName,
              intro: form.intro,
              contactEmail,
              enabled: form.enabled,
            })
          }
        >
          {t("save")}
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t("snapshotsHeading")}</h2>
        <div className="space-y-1 text-sm">
          {(usecases.data ?? []).map((u) => (
            <label key={u.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected.includes(u.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, u.id]
                      : selected.filter((x) => x !== u.id),
                  )
                }
              />
              {u.name}
            </label>
          ))}
        </div>
        <Button
          disabled={selected.length === 0}
          onClick={() => createDraft.mutate({ usecaseIds: selected })}
        >
          {t("createDraft")}
        </Button>
        <ul className="space-y-2 text-sm">
          {(snapshots.data ?? []).map((s) => (
            <li key={s.id} className="flex items-center gap-3">
              <Badge>{s.status}</Badge>
              <Button
                size="sm"
                variant={previewId === s.id ? "secondary" : "ghost"}
                onClick={() => setPreviewId(s.id)}
              >
                {s.version === null ? "—" : `v${s.version}`}
              </Button>
              {s.status === "draft" ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => publish.mutate({ id: s.id })}
                  >
                    {t("publish")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteDraft.mutate({ id: s.id })}
                  >
                    {t("deleteDraft")}
                  </Button>
                </>
              ) : null}
              {s.status === "published" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => withdraw.mutate({ id: s.id })}
                >
                  {t("withdraw")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {previewId ? (
          <TwinDraftPreview
            snapshotId={previewId}
            displayName={form.displayName}
            contactEmail={contactEmail}
          />
        ) : null}
      </section>
    </div>
  );
}
