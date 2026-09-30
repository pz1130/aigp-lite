"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { HONEYPOT_FIELD } from "@/lib/external-reports/submission";

export function PublicReportForm({
  token,
  renderedAt,
}: {
  token: string;
  renderedAt: string;
}) {
  const t = useTranslations("externalReports.public");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    const form = new FormData(e.currentTarget);
    const payload = {
      token,
      renderedAt,
      [HONEYPOT_FIELD]: form.get(HONEYPOT_FIELD) ?? "",
      type: form.get("type"),
      title: form.get("title"),
      description: form.get("description"),
      reproSteps: form.get("reproSteps"),
      reporterEmail: form.get("reporterEmail") || undefined,
    };
    const res = await fetch("/api/external-reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setState(res.ok ? "sent" : "error");
  }

  if (state === "sent") {
    return <p className="mt-8 rounded-md border p-4 text-sm">{t("thanks")}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <input
        type="text"
        name={HONEYPOT_FIELD}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      <label className="block text-sm font-medium">
        {t("type")}
        <select
          name="type"
          required
          className="mt-1 block w-full rounded-md border p-2"
        >
          <option value="vulnerability">{t("typeVulnerability")}</option>
          <option value="usage_violation">{t("typeUsageViolation")}</option>
        </select>
      </label>

      <label className="block text-sm font-medium">
        {t("titleLabel")}
        <input
          name="title"
          required
          maxLength={200}
          className="mt-1 block w-full rounded-md border p-2"
        />
      </label>

      <label className="block text-sm font-medium">
        {t("descriptionLabel")}
        <textarea
          name="description"
          required
          maxLength={8000}
          rows={6}
          className="mt-1 block w-full rounded-md border p-2"
        />
      </label>

      <label className="block text-sm font-medium">
        {t("reproLabel")}
        <textarea
          name="reproSteps"
          maxLength={8000}
          rows={4}
          className="mt-1 block w-full rounded-md border p-2"
        />
      </label>

      <label className="block text-sm font-medium">
        {t("emailLabel")}
        <input
          name="reporterEmail"
          type="email"
          className="mt-1 block w-full rounded-md border p-2"
        />
      </label>

      <button
        type="submit"
        disabled={state === "sending"}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        {state === "sending" ? t("sending") : t("submit")}
      </button>
      {state === "error" && (
        <p className="text-sm text-red-600">{t("error")}</p>
      )}
    </form>
  );
}
