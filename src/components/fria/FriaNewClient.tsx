"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { trpc } from "@/lib/trpc/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function FriaNewClient({ usecaseId }: { usecaseId: string }) {
  const t = useTranslations("fria");
  const router = useRouter();
  const [title, setTitle] = useState("");
  const create = trpc.fria.create.useMutation({
    onSuccess: (r) => router.push(`/inventory/${usecaseId}/fria/${r.id}`),
  });
  return (
    <div className="max-w-xl space-y-4">
      <label className="block text-sm">
        Title
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </label>
      <Button
        onClick={() => create.mutate({ usecaseId, title })}
        disabled={title.trim().length === 0 || create.isPending}
      >
        {t("startNew")}
      </Button>
      {create.error && (
        <p className="text-sm text-red-500">{create.error.message}</p>
      )}
    </div>
  );
}
