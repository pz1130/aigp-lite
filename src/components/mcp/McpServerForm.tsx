"use client";
import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { trpc } from "@/lib/trpc/client";
import type { RouterInput, RouterOutput } from "@/lib/trpc/types";
import { useTranslations } from "next-intl";
import { FormLayout } from "@/components/page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface ToolRow {
  name: string;
  description: string;
  riskTier: "low" | "medium" | "high" | "critical";
}

type RiskTier = ToolRow["riskTier"];

type McpServer = NonNullable<RouterOutput["mcp"]["byId"]>;

interface McpServerFormProps {
  mode: "create" | "edit";
  server?: McpServer;
}

export function McpServerForm({ mode, server }: McpServerFormProps) {
  const t = useTranslations("mcp");
  const router = useRouter();
  const [name, setName] = useState(server?.name ?? "");
  const [endpoint, setEndpoint] = useState(server?.endpoint ?? "");
  const [transport, setTransport] = useState<string>(
    server?.transport ?? "http",
  );
  const [authType, setAuthType] = useState<string>(server?.authType ?? "none");
  const [riskTier, setRiskTier] = useState<RiskTier>(
    (server?.riskTier as RiskTier | undefined) ?? "medium",
  );
  const [owner, setOwner] = useState(server?.owner ?? "");
  const [notes, setNotes] = useState(server?.notes ?? "");
  const [authToken, setAuthToken] = useState("");
  const [tools, setTools] = useState<ToolRow[]>(
    server?.tools?.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      riskTier: t.riskTier,
    })) ?? [],
  );

  const create = trpc.mcp.create.useMutation({
    onSuccess: (r) => router.push(`/mcp/${r.id}`),
  });
  const update = trpc.mcp.update.useMutation({
    onSuccess: (r) => router.push(`/mcp/${r.id}`),
  });

  function addTool() {
    setTools([...tools, { name: "", description: "", riskTier }]);
  }

  function removeTool(i: number) {
    setTools(tools.filter((_, idx) => idx !== i));
  }

  function updateTool(i: number, field: keyof ToolRow, value: string) {
    const next = [...tools];
    next[i] = { ...next[i], [field]: value };
    setTools(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: RouterInput["mcp"]["create"] = {
      name,
      endpoint,
      transport: transport as "stdio" | "http",
      authType: authType as "none" | "token" | "oauth",
      riskTier: riskTier as "low" | "medium" | "high" | "critical",
      owner: owner || undefined,
      notes: notes || undefined,
      ...(authToken.trim() && { authToken: authToken.trim() }),
      tools: tools
        .filter((t) => t.name.trim())
        .map((t) => ({
          name: t.name,
          description: t.description || undefined,
          riskTier: t.riskTier,
        })),
    };
    if (mode === "create") create.mutate(data);
    else update.mutate({ id: server!.id, ...data });
  }

  return (
    <FormLayout
      onSubmit={handleSubmit}
      onCancel={() => router.push("/mcp")}
      submitting={create.isPending || update.isPending}
      submitLabel={mode === "create" ? t("addServer") : "Save"}
      cancelLabel="Cancel"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-primary mb-1.5">
            {t("fields.name")}
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
        </div>
        <div>
          <label className="block text-sm text-primary mb-1.5">
            {t("fields.endpoint")}
            <Input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              required
            />
          </label>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-primary mb-1.5">
            {t("fields.transport")}
            <Select value={transport} onValueChange={setTransport}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="http">{t("transport.http")}</SelectItem>
                <SelectItem value="stdio">{t("transport.stdio")}</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        <div>
          <label className="block text-sm text-primary mb-1.5">
            {t("fields.authType")}
            <Select value={authType} onValueChange={setAuthType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("authType.none")}</SelectItem>
                <SelectItem value="token">{t("authType.token")}</SelectItem>
                <SelectItem value="oauth">{t("authType.oauth")}</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        <div>
          <label className="block text-sm text-primary mb-1.5">
            {t("fields.riskTier")}
            <Select
              value={riskTier}
              onValueChange={(value) => setRiskTier(value as RiskTier)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{t("riskTier.low")}</SelectItem>
                <SelectItem value="medium">{t("riskTier.medium")}</SelectItem>
                <SelectItem value="high">{t("riskTier.high")}</SelectItem>
                <SelectItem value="critical">
                  {t("riskTier.critical")}
                </SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
      </div>
      {transport === "http" && (
        <div>
          <label className="block text-sm text-primary mb-1.5">
            {t("drift.tokenLabel")}
            <Input
              type="password"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              autoComplete="off"
            />
          </label>
          <p className="mt-1 text-xs text-tertiary">
            {server?.hasAuthToken ? t("drift.tokenSet") : t("drift.tokenHint")}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-primary mb-1.5">
            {t("fields.owner")}
            <Input value={owner} onChange={(e) => setOwner(e.target.value)} />
          </label>
        </div>
        <div>
          <label className="block text-sm text-primary mb-1.5">
            {t("fields.notes")}
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-primary">
            {t("tools.title")}
          </h3>
          <Button type="button" variant="secondary" size="sm" onClick={addTool}>
            {t("tools.addTool")}
          </Button>
        </div>
        {tools.length === 0 && (
          <p className="text-sm text-tertiary">{t("tools.empty")}</p>
        )}
        {tools.map((tool, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_2fr_auto_auto] gap-2 items-end"
          >
            <div>
              <Input
                placeholder={t("tools.name")}
                value={tool.name}
                onChange={(e) => updateTool(i, "name", e.target.value)}
              />
            </div>
            <div>
              <Input
                placeholder={t("tools.description")}
                value={tool.description}
                onChange={(e) => updateTool(i, "description", e.target.value)}
              />
            </div>
            <div>
              <Select
                value={tool.riskTier}
                onValueChange={(v) => updateTool(i, "riskTier", v)}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("riskTier.low")}</SelectItem>
                  <SelectItem value="medium">{t("riskTier.medium")}</SelectItem>
                  <SelectItem value="high">{t("riskTier.high")}</SelectItem>
                  <SelectItem value="critical">
                    {t("riskTier.critical")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeTool(i)}
            >
              ✕
            </Button>
          </div>
        ))}
      </div>
    </FormLayout>
  );
}
