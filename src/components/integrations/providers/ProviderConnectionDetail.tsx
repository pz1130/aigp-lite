"use client";
import { useState, useEffect } from "react";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import type { RouterInput } from "@/lib/trpc/types";
import { getCatalogEntry, CATALOG } from "@/lib/runtime/catalog";
import { MaskedInput } from "./MaskedInput";
import { ModelPicker } from "./ModelPicker";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export function ProviderConnectionDetail({ id }: { id: string }) {
  const t = useTranslations();
  const router = useRouter();
  const q = trpc.providerConnection.get.useQuery({ id });
  const connections = trpc.providerConnection.list.useQuery();
  const utils = trpc.useUtils();
  const update = trpc.providerConnection.update.useMutation();
  const ping = trpc.providerConnection.ping.useMutation();
  const remove = trpc.providerConnection.delete.useMutation({
    onSuccess: () => router.push("/integrations/providers"),
  });

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Record<string, string>>({});
  const [defaultModel, setDefaultModel] = useState("");
  const [fallbackConnectionId, setFallbackConnectionId] = useState("");
  const [fallbackModel, setFallbackModel] = useState("");
  const [failureThreshold, setFailureThreshold] = useState("3");
  const [cooldownSeconds, setCooldownSeconds] = useState("300");
  const [isActive, setIsActive] = useState(true);
  const [supportsEmbeddings, setSupportsEmbeddings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const listModels = trpc.providerConnection.listModels.useMutation();

  useEffect(() => {
    if (editing && !listModels.isPending) {
      discoverModels().catch(() => {});
    }
  }, [editing]);

  if (q.isLoading) return <p>{t("common.loading")}</p>;
  if (!q.data) return <p>{t("common.notFound")}</p>;

  const row = q.data;
  const entry = getCatalogEntry(row.providerType.replace("_", "-"));
  const catalogEntry =
    entry ?? CATALOG.find((e) => e.providerType === row.providerType);
  const rowConfig = (row.config ?? {}) as Record<string, unknown>;
  const circuitState =
    rowConfig.circuitState && typeof rowConfig.circuitState === "object"
      ? (rowConfig.circuitState as Record<string, unknown>)
      : {};
  const openedUntil =
    typeof circuitState.openedUntil === "string"
      ? circuitState.openedUntil
      : null;
  const circuitOpen = openedUntil
    ? new Date(openedUntil).getTime() > Date.now()
    : false;

  function startEdit() {
    setEditing(true);
    setName(row.name ?? "");
    setBaseUrl(row.baseUrl ?? entry?.defaultBaseUrl ?? "");
    setIsActive(row.isActive ?? true);
    const currentConfig = (row.config ?? {}) as Record<string, unknown>;
    const currentModel =
      typeof currentConfig.defaultModel === "string"
        ? currentConfig.defaultModel
        : "";
    const circuitBreaker =
      currentConfig.circuitBreaker &&
      typeof currentConfig.circuitBreaker === "object"
        ? (currentConfig.circuitBreaker as Record<string, unknown>)
        : {};
    setDefaultModel(currentModel);
    setFallbackConnectionId(
      typeof currentConfig.fallbackConnectionId === "string"
        ? currentConfig.fallbackConnectionId
        : "",
    );
    setFallbackModel(
      typeof currentConfig.fallbackModel === "string"
        ? currentConfig.fallbackModel
        : "",
    );
    setFailureThreshold(String(circuitBreaker.failureThreshold ?? 3));
    setCooldownSeconds(
      String(Math.round(Number(circuitBreaker.cooldownMs ?? 300000) / 1000)),
    );
    setSupportsEmbeddings(
      typeof currentConfig.supportsEmbeddings === "boolean"
        ? currentConfig.supportsEmbeddings
        : false,
    );
    setConfig({});
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const normalizedBaseUrl = baseUrl || null;
      const updates: Partial<
        Omit<RouterInput["providerConnection"]["update"], "id">
      > = {};
      if (name !== row.name) updates.name = name;
      if (normalizedBaseUrl !== (row.baseUrl ?? null))
        updates.baseUrl = normalizedBaseUrl;
      if (isActive !== row.isActive) updates.isActive = isActive;
      if (Object.keys(credentials).length > 0)
        updates.credentials = credentials;

      const existingConfig = (row.config ?? {}) as Record<string, unknown>;
      const existingModel =
        typeof existingConfig.defaultModel === "string"
          ? existingConfig.defaultModel
          : "";
      const nextConfig = {
        ...existingConfig,
        ...config,
        ...(defaultModel ? { defaultModel } : {}),
        ...(fallbackConnectionId ? { fallbackConnectionId } : {}),
        ...(fallbackModel ? { fallbackModel } : {}),
        supportsEmbeddings,
        circuitBreaker: {
          failureThreshold: Number(failureThreshold) || 3,
          cooldownMs: (Number(cooldownSeconds) || 300) * 1000,
        },
      };
      if (!defaultModel)
        delete (nextConfig as Record<string, unknown>).defaultModel;
      if (!fallbackConnectionId)
        delete (nextConfig as Record<string, unknown>).fallbackConnectionId;
      if (!fallbackModel)
        delete (nextConfig as Record<string, unknown>).fallbackModel;
      if (!supportsEmbeddings)
        delete (nextConfig as Record<string, unknown>).supportsEmbeddings;
      const configChanged =
        Object.keys(config).length > 0 ||
        defaultModel !== existingModel ||
        fallbackConnectionId !==
          (typeof existingConfig.fallbackConnectionId === "string"
            ? existingConfig.fallbackConnectionId
            : "") ||
        fallbackModel !==
          (typeof existingConfig.fallbackModel === "string"
            ? existingConfig.fallbackModel
            : "") ||
        JSON.stringify(nextConfig.circuitBreaker) !==
          JSON.stringify(
            existingConfig.circuitBreaker ?? {
              failureThreshold: 3,
              cooldownMs: 300000,
            },
          );
      if (configChanged) updates.config = nextConfig;

      await update.mutateAsync({ id, ...updates });
      await utils.providerConnection.get.invalidate({ id });
      await utils.providerConnection.list.invalidate();
      setEditing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function discoverModels() {
    return listModels.mutateAsync({ id });
  }

  async function handlePing() {
    try {
      const result = await ping.mutateAsync({ id });
      alert(
        result.ok
          ? `Ping OK (${result.latencyMs}ms)`
          : `Ping failed: ${result.status}`,
      );
      await utils.providerConnection.get.invalidate({ id });
    } catch {
      alert("Ping failed");
    }
  }

  function handleDelete() {
    setShowDeleteConfirm(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{row.name}</h2>
        <div className="flex gap-2">
          {!editing && (
            <>
              <Button variant="secondary" size="sm" onClick={startEdit}>
                {t("common.edit")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePing}
                disabled={ping.isPending}
              >
                {ping.isPending
                  ? t("common.testing")
                  : t("provider.action.ping")}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
                disabled={remove.isPending}
              >
                {t("common.delete")}
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push("/integrations/providers")}
          >
            {t("common.back")}
          </Button>
        </div>
      </div>

      <div className="text-sm text-secondary">
        <span className="font-mono">{row.providerType}</span>
        {" · "}
        <span className={row.isActive ? "text-success" : "text-danger"}>
          {row.isActive ? "active" : "inactive"}
        </span>
        {row.lastValidationStatus && (
          <> · last validated: {row.lastValidationStatus}</>
        )}
        {circuitOpen && openedUntil && (
          <>
            {" "}
            ·{" "}
            <span className="text-warn">
              {t("provider.reliability.circuitOpenUntil", {
                time: new Date(openedUntil).toLocaleString(),
              })}
            </span>
          </>
        )}
      </div>

      {!editing ? (
        <div className="space-y-3 text-sm">
          <div>
            <strong>Base URL:</strong>{" "}
            {row.baseUrl || entry?.defaultBaseUrl || "—"}
          </div>
          {(() => {
            const cfg = (row.config ?? {}) as Record<string, unknown>;
            const m =
              typeof cfg.defaultModel === "string" ? cfg.defaultModel : null;
            const fb =
              typeof cfg.fallbackConnectionId === "string"
                ? (connections.data?.find(
                    (c) => c.id === cfg.fallbackConnectionId,
                  )?.name ?? cfg.fallbackConnectionId)
                : null;
            return (
              <>
                {m ? (
                  <div>
                    <strong>{t("provider.model.label")}:</strong>{" "}
                    <span className="font-mono">{m}</span>
                  </div>
                ) : null}
                {fb ? (
                  <div>
                    <strong>
                      {t("provider.reliability.fallbackConnection")}:
                    </strong>{" "}
                    {fb}
                  </div>
                ) : null}
              </>
            );
          })()}
          {row.lastValidatedAt && (
            <div>
              <strong>Last validated:</strong>{" "}
              {new Date(row.lastValidatedAt).toLocaleString()}
            </div>
          )}
          {catalogEntry && (
            <div className="text-secondary">
              {t(catalogEntry.descriptionKey)}
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="max-w-lg space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium">
              {t("provider.field.name")} *
              <Input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium">
              {t("provider.field.baseUrl")}
              <Input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </label>
          </div>

          {entry?.credFields.map((f) => (
            <MaskedInput
              key={f.key}
              name={f.key}
              label={t(f.label)}
              required={f.required}
              hasExistingValue={true}
              onChange={(v) =>
                setCredentials((c) => ({ ...c, [f.key]: v ?? "" }))
              }
            />
          ))}

          {entry?.configFields.map((f) => (
            <div key={f.key} className="space-y-1">
              <label className="block text-sm font-medium">
                {t(f.label)}
                {f.required && " *"}
                <Input
                  type="text"
                  required={f.required}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, [f.key]: e.target.value }))
                  }
                  placeholder={f.placeholder}
                />
              </label>
            </div>
          ))}

          <ModelPicker
            value={defaultModel}
            onChange={setDefaultModel}
            sampleModels={catalogEntry?.sampleModels ?? []}
            onDiscover={discoverModels}
          />

          <div className="rounded-md border border-border-default p-3 space-y-3">
            <h3 className="text-sm font-semibold">
              {t("provider.reliability.title")}
            </h3>
            <div>
              <label className="block text-sm font-medium mb-1">
                {t("provider.reliability.fallbackConnection")}
                <Select
                  value={fallbackConnectionId}
                  onValueChange={setFallbackConnectionId}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t("provider.reliability.noFallback")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">
                      {t("provider.reliability.noFallback")}
                    </SelectItem>
                    {(connections.data ?? [])
                      .filter((c) => c.id !== row.id && c.isActive)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium">
                {t("provider.reliability.fallbackModel")}
                <Input
                  type="text"
                  value={fallbackModel}
                  onChange={(e) => setFallbackModel(e.target.value)}
                  placeholder={t(
                    "provider.reliability.fallbackModelPlaceholder",
                  )}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-sm font-medium">
                  {t("provider.reliability.failureThreshold")}
                  <Input
                    type="number"
                    min="1"
                    value={failureThreshold}
                    onChange={(e) => setFailureThreshold(e.target.value)}
                  />
                </label>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium">
                  {t("provider.reliability.cooldownSeconds")}
                  <Input
                    type="number"
                    min="1"
                    value={cooldownSeconds}
                    onChange={(e) => setCooldownSeconds(e.target.value)}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="isActive"
              checked={isActive}
              onCheckedChange={(v) => setIsActive(v === true)}
            />
            <label htmlFor="isActive" className="text-sm">
              {t("provider.field.isActive")}
            </label>
          </div>

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

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? t("common.saving") : t("common.save")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditing(false)}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t("provider.connection.deleteConfirm")}
        confirmLabel={t("common.delete")}
        variant="danger"
        onConfirm={() => {
          remove.mutate({ id });
          setShowDeleteConfirm(false);
        }}
      />
    </div>
  );
}
