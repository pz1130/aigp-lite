"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editId?: string | null;
  onSaved: () => void;
}

export function AuditSinkForm({ open, onOpenChange, editId, onSaved }: Props) {
  const t = useTranslations("audit.sinks");
  const tCommon = useTranslations("common");

  const [type, setType] = useState<"webhook" | "syslog" | "datadog">("webhook");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("514");
  const [protocol, setProtocol] = useState<"udp" | "tcp">("udp");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const existing = trpc.auditSink.get.useQuery(
    { id: editId! },
    { enabled: !!editId },
  );

  useEffect(() => {
    if (existing.data) {
      setType(existing.data.type as "webhook" | "syslog" | "datadog");
      setName(existing.data.name);
      setUrl(existing.data.url ?? "");
      setToken("");
      setHost(existing.data.host ?? "");
      setPort(String(existing.data.port ?? "514"));
      setProtocol((existing.data.protocol as "udp" | "tcp") ?? "udp");
      setApiKey("");
      setEnabled(existing.data.enabled);
    }
  }, [existing.data]);

  useEffect(() => {
    if (!open) {
      setType("webhook");
      setName("");
      setUrl("");
      setToken("");
      setHost("");
      setPort("514");
      setProtocol("udp");
      setApiKey("");
      setEnabled(true);
      setError(null);
    }
  }, [open]);

  const create = trpc.auditSink.create.useMutation({
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
    },
    onError: (err) => setError(err.message),
  });

  const update = trpc.auditSink.update.useMutation({
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (editId) {
      update.mutate({
        id: editId,
        name,
        url: type === "webhook" || type === "datadog" ? url || null : null,
        token: type === "webhook" ? token || undefined : undefined,
        host: type === "syslog" ? host : null,
        port: type === "syslog" ? parseInt(port, 10) : null,
        protocol: type === "syslog" ? protocol : undefined,
        apiKey: type === "datadog" ? apiKey || undefined : undefined,
        enabled,
      });
    } else {
      if (type === "webhook") {
        create.mutate({
          type: "webhook",
          name,
          url,
          token: token || undefined,
          enabled,
        });
      } else if (type === "syslog") {
        create.mutate({
          type: "syslog",
          name,
          host,
          port: parseInt(port, 10),
          protocol,
          enabled,
        });
      } else {
        create.mutate({
          type: "datadog",
          name,
          url: url || undefined,
          apiKey: apiKey || undefined,
          enabled,
        });
      }
    }
  }

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{editId ? t("editTitle") : t("createTitle")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              {t("field.name")} *
              <Input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t("field.type")} *
              <Select
                value={type}
                onValueChange={(v) =>
                  setType(v as "webhook" | "syslog" | "datadog")
                }
              >
                <SelectTrigger disabled={!!editId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="webhook">{t("type.webhook")}</SelectItem>
                  <SelectItem value="syslog">{t("type.syslog")}</SelectItem>
                  <SelectItem value="datadog">{t("type.datadog")}</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          {type === "webhook" && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("field.url")} *
                  <Input
                    type="url"
                    required
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://your-splunk:8088/services/collector"
                  />
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("field.token")}
                  <Input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={
                      editId
                        ? "Leave blank to keep the existing secret"
                        : "Splunk HEC token"
                    }
                  />
                </label>
              </div>
            </>
          )}

          {type === "syslog" && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("field.host")} *
                  <Input
                    type="text"
                    required
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="syslog.example.com"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("field.port")} *
                    <Input
                      type="number"
                      required
                      min={1}
                      max={65535}
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                    />
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("field.protocol")}
                    <Select
                      value={protocol}
                      onValueChange={(v) => setProtocol(v as "udp" | "tcp")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="udp">UDP</SelectItem>
                        <SelectItem value="tcp">TCP</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </div>
              </div>
            </>
          )}

          {type === "datadog" && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("field.url")}
                  <Input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://http-intake.logs.datadoghq.com/api/v2/logs"
                  />
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("field.apiKey")}
                  {editId ? "" : " *"}
                  <Input
                    type="password"
                    required={!editId}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      editId
                        ? "Leave blank to keep the existing secret"
                        : "DD-API-KEY"
                    }
                  />
                </label>
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="enabled"
              checked={enabled}
              onCheckedChange={(v) => setEnabled(v === true)}
            />
            <label htmlFor="enabled" className="text-sm">
              {t("field.enabled")}
            </label>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending
                ? tCommon("saving")
                : editId
                  ? tCommon("save")
                  : tCommon("create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
