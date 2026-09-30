"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";

export function RedteamAttestationsPanel({
  usecaseId,
  canWrite,
}: {
  usecaseId: string;
  canWrite: boolean;
}) {
  const t = useTranslations("redteamAttestation");
  const router = useRouter();
  const list = trpc.redteamAttestation.list.useQuery({ usecaseId });
  const del = trpc.redteamAttestation.delete.useMutation({
    onSuccess: () => list.refetch(),
  });

  const [open, setOpen] = useState(false);
  const [attesterName, setAttesterName] = useState("");
  const [scope, setScope] = useState("");
  const [attestedAt, setAttestedAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(t("selectFile"));
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("usecaseId", usecaseId);
    fd.append("attesterName", attesterName);
    fd.append("scope", scope);
    if (attestedAt) fd.append("attestedAt", new Date(attestedAt).toISOString());

    setSubmitting(true);
    try {
      const res = await fetch("/api/redteam-attestation", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setAttesterName("");
      setScope("");
      setAttestedAt("");
      if (fileRef.current) fileRef.current.value = "";
      setOpen(false);
      list.refetch();
      router.refresh();
    } catch (err) {
      setError(t("uploadFailed") + (err instanceof Error ? err.message : ""));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      id="redteam"
      className="space-y-3 rounded-lg border border-border-default p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        {canWrite && (
          <button
            type="button"
            className="text-sm text-accent hover:underline"
            onClick={() => setOpen((v) => !v)}
          >
            {t("add")}
          </button>
        )}
      </div>
      <p className="text-xs text-tertiary">{t("disclaimer")}</p>

      {list.data && list.data.length === 0 && (
        <p className="text-sm text-secondary">{t("empty")}</p>
      )}

      <ul className="space-y-2">
        {list.data?.map((a) => (
          <li
            key={a.id}
            className="flex items-start justify-between gap-3 rounded border border-border-default p-3 text-sm"
          >
            <div className="min-w-0">
              <div className="font-medium">
                {a.attesterName}
                {a.attesterOrg ? ` · ${a.attesterOrg}` : ""}
              </div>
              <div className="text-secondary">
                {new Date(a.attestedAt).toISOString().slice(0, 10)} — {a.scope}
              </div>
              <div className="truncate font-mono text-xs text-tertiary">
                SHA-256: {a.reportSha256}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <a
                href={`/api/redteam-attestation/download/${a.id}`}
                className="text-xs text-accent hover:underline"
              >
                {t("download")}
              </a>
              {canWrite && (
                <button
                  type="button"
                  className="text-xs text-danger hover:underline"
                  onClick={() => del.mutate({ id: a.id })}
                >
                  {t("delete")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {open && canWrite && (
        <form
          onSubmit={onSubmit}
          className="space-y-3 rounded border border-border-default p-3"
        >
          <label className="block text-sm font-medium">
            {t("attester")} *
            <input
              value={attesterName}
              onChange={(e) => setAttesterName(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-border-default bg-surface px-3 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm font-medium">
            {t("scope")} *
            <textarea
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              required
              rows={2}
              className="mt-1 block w-full rounded-md border border-border-default bg-surface px-3 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm font-medium">
            {t("attestedAt")} *
            <input
              type="date"
              value={attestedAt}
              onChange={(e) => setAttestedAt(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-border-default bg-surface px-3 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm font-medium">
            {t("file")} *
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              required
              className="mt-1 block w-full text-sm"
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {submitting ? t("submitting") : t("submit")}
          </button>
        </form>
      )}
    </section>
  );
}
