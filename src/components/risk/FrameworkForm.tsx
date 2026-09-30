"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormLayout } from "@/components/page/FormLayout";

interface Props {
  id?: string;
  initial?: {
    code: string;
    name: string;
    version: string;
    description?: string;
  };
}

export function FrameworkForm({ id, initial }: Props) {
  const t = useTranslations("risk");
  const tc = useTranslations("common");
  const router = useRouter();
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [version, setVersion] = useState(initial?.version ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);

  const create = trpc.risk.frameworkCreate.useMutation();
  const update = trpc.risk.frameworkUpdate.useMutation();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (id) {
        await update.mutateAsync({ id, name, version, description });
        router.push(`/risk/frameworks/${code}`);
      } else {
        const created = await create.mutateAsync({
          code,
          name,
          version,
          description,
        });
        router.push(`/risk/frameworks/${created.code}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <FormLayout
      onSubmit={onSubmit}
      onCancel={() => router.push("/risk")}
      submitting={create.isPending || update.isPending}
      submitLabel={id ? tc("save") : tc("create")}
      cancelLabel={tc("cancel")}
    >
      <div>
        <label className="block text-sm mb-1.5">
          {t("fields.code")}
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={!!id}
            required
            maxLength={50}
            placeholder="MY_FRAMEWORK"
          />
        </label>
        <p className="text-xs text-tertiary mt-1">{t("codeHint")}</p>
      </div>
      <div>
        <label className="block text-sm mb-1.5">
          {t("fields.name")}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
        </label>
      </div>
      <div>
        <label className="block text-sm mb-1.5">
          {t("fields.version")}
          <Input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            required
            maxLength={20}
            placeholder="1.0"
          />
        </label>
      </div>
      <div>
        <label className="block text-sm mb-1.5">
          {t("fields.description")}
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            placeholder={t("descriptionPlaceholder")}
          />
        </label>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </FormLayout>
  );
}
