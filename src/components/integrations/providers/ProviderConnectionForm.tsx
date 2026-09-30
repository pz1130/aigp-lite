"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { getCatalogEntry } from "@/lib/runtime/catalog";
import { MaskedInput } from "./MaskedInput";
import { ModelPicker } from "./ModelPicker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useRouter } from "@/i18n/routing";

interface Props {
  catalogSlug: string;
  onCancel: () => void;
}

export function ProviderConnectionForm({ catalogSlug, onCancel }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const entry = getCatalogEntry(catalogSlug);
  if (!entry) return <p>Unknown catalog entry: {catalogSlug}</p>;

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState(entry.defaultBaseUrl ?? "");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Record<string, string>>({});
  const [defaultModel, setDefaultModel] = useState("");
  const [supportsEmbeddings, setSupportsEmbeddings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [readyToDiscover, setReadyToDiscover] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const create = trpc.providerConnection.create.useMutation();
  const ping = trpc.providerConnection.ping.useMutation();
  const listModelsPreview =
    trpc.providerConnection.listModelsPreview.useMutation();
  const utils = trpc.useUtils();

  // Auto-discover models when all required credentials are filled
  const checkReadyToDiscover = useCallback(() => {
    const requiredCreds = entry.credFields.filter((f) => f.required);
    const allCredsFilled = requiredCreds.every((f) => {
      const v = credentials[f.key];
      return v && v.trim().length > 0;
    });
    const hasBaseUrl = !!entry.defaultBaseUrl || baseUrl.trim().length > 0;
    return allCredsFilled && hasBaseUrl;
  }, [entry, credentials, baseUrl]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setReadyToDiscover(checkReadyToDiscover());
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [credentials, baseUrl, checkReadyToDiscover]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const finalConfig = {
        ...config,
        ...(defaultModel ? { defaultModel } : {}),
        ...(supportsEmbeddings ? { supportsEmbeddings } : {}),
      };
      const row = await create.mutateAsync({
        catalogSlug,
        name,
        baseUrl,
        credentials,
        config: finalConfig,
      });
      // fire-and-forget ping
      ping.mutate({ id: row.id });
      await utils.providerConnection.list.invalidate();
      router.push("/integrations/providers");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function discoverModels() {
    return listModelsPreview.mutateAsync({
      catalogSlug,
      baseUrl,
      credentials,
      config,
    });
  }

  return (
    <form onSubmit={submit} className="max-w-lg space-y-4">
      <h2 className="text-xl font-semibold">{t(entry.displayNameKey)}</h2>
      <p className="text-sm text-tertiary">{t(entry.descriptionKey)}</p>

      <div className="space-y-1">
        <label className="block text-sm font-medium">
          {t("provider.field.name")} *
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. prod-deepseek"
            className="w-full rounded border px-3 py-2"
          />
        </label>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium">
          {t("provider.field.baseUrl")} *
          <input
            type="text"
            required={!entry.defaultBaseUrl}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={
              entry.defaultBaseUrl ?? "https://your-endpoint.example.com"
            }
            className="w-full rounded border px-3 py-2"
          />
        </label>
      </div>

      {entry.credFields.map((f) =>
        f.secret ? (
          <MaskedInput
            key={f.key}
            name={f.key}
            label={t(f.label)}
            required={f.required}
            hasExistingValue={false}
            onChange={(v) =>
              setCredentials((c) => ({ ...c, [f.key]: v ?? "" }))
            }
          />
        ) : (
          <div key={f.key} className="space-y-1">
            <label className="block text-sm font-medium">
              {t(f.label)}
              {f.required && " *"}
              <input
                required={f.required}
                onChange={(e) =>
                  setCredentials((c) => ({ ...c, [f.key]: e.target.value }))
                }
                className="w-full rounded border px-3 py-2"
              />
            </label>
          </div>
        ),
      )}

      {entry.configFields.map((f) => (
        <div key={f.key} className="space-y-1">
          <label className="block text-sm font-medium">
            {t(f.label)}
            {f.required && " *"}
            <input
              type="text"
              required={f.required}
              onChange={(e) =>
                setConfig((c) => ({ ...c, [f.key]: e.target.value }))
              }
              placeholder={f.placeholder}
              className="w-full rounded border px-3 py-2"
            />
          </label>
        </div>
      ))}

      <ModelPicker
        value={defaultModel}
        onChange={setDefaultModel}
        sampleModels={entry.sampleModels}
        onDiscover={discoverModels}
        autoDiscoverOnMount={readyToDiscover}
      />

      <div className="flex items-center gap-2">
        <Checkbox
          id="supportsEmbeddings"
          checked={supportsEmbeddings}
          onCheckedChange={(v) => setSupportsEmbeddings(v === true)}
        />
        <label htmlFor="supportsEmbeddings" className="text-sm">
          {t("provider.field.supportsEmbeddings")}
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? t("common.saving") : t("common.create")}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
