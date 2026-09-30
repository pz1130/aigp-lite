"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";

export function DeprecatePanel({ usecaseId }: { usecaseId: string }) {
  const t = useTranslations("inventory");
  const router = useRouter();
  const [sunsetDate, setSunsetDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const deprecate = trpc.inventory.deprecate.useMutation({
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-4">
      <h3 className="font-semibold">{t("deprecate.action")}</h3>
      <label className="block text-sm">
        <span className="text-gray-500">{t("deprecate.sunsetDate")}</span>
        <input
          type="date"
          className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
          value={sunsetDate}
          onChange={(e) => setSunsetDate(e.target.value)}
        />
      </label>
      <textarea
        className="w-full rounded border border-gray-300 p-2 text-sm"
        placeholder={t("deprecate.reason")}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={deprecate.isPending}
        onClick={() =>
          deprecate.mutate({
            usecaseId,
            sunsetDate: sunsetDate ? `${sunsetDate}T00:00:00.000Z` : null,
            reason,
          })
        }
        className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
      >
        {t("deprecate.submit")}
      </button>
    </div>
  );
}
