"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useTranslations } from "next-intl";
import { DataTable, type DataTableColumn } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ApiKey {
  id: string;
  label: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export function ApiKeyManager() {
  const t = useTranslations("policy");
  const keysQ = trpc.policy.apiKeys.list.useQuery();
  const createKey = trpc.policy.apiKeys.create.useMutation();
  const revokeKey = trpc.policy.apiKeys.revoke.useMutation();
  const [newLabel, setNewLabel] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  function handleCreate() {
    createKey.mutate(
      { label: newLabel },
      {
        onSuccess: (result) => {
          setCreatedKey(result.key);
          setNewLabel("");
          keysQ.refetch();
        },
      },
    );
  }

  const columns: DataTableColumn<ApiKey>[] = [
    {
      key: "label",
      header: t("keyLabel"),
      render: (k) => (
        <span className="font-medium text-primary">{k.label}</span>
      ),
    },
    {
      key: "prefix",
      header: "Prefix",
      width: "120px",
      render: (k) => (
        <code className="font-mono text-xs text-secondary">{k.prefix}…</code>
      ),
    },
    {
      key: "createdAt",
      header: "Created",
      width: "140px",
      render: (k) => (
        <span className="text-secondary">
          {k.createdAt.toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "lastUsedAt",
      header: "Last used",
      width: "140px",
      render: (k) => (
        <span className="text-secondary">
          {k.lastUsedAt?.toLocaleDateString() ?? "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "80px",
      align: "right",
      render: (k) => (
        <Button
          variant="ghost"
          size="sm"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-danger"
          onClick={() =>
            revokeKey.mutate({ id: k.id }, { onSuccess: () => keysQ.refetch() })
          }
        >
          {t("revoke")}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 max-w-md">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder={t("keyLabel")}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <Button
          onClick={handleCreate}
          disabled={!newLabel || createKey.isPending}
        >
          {t("createKey")}
        </Button>
      </div>
      {createdKey && (
        <div className="rounded-md border border-accent-subtle bg-accent-subtle p-3">
          <p className="text-sm font-semibold text-accent">{t("keyShow")}</p>
          <code className="mt-2 block font-mono text-xs bg-surface rounded px-2 py-1">
            {createdKey}
          </code>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCreatedKey(null)}
            className="mt-2 text-xs text-accent"
          >
            Dismiss
          </Button>
        </div>
      )}
      <DataTable
        rows={keysQ.data as ApiKey[] | undefined}
        isLoading={keysQ.isLoading}
        error={keysQ.error ? { message: keysQ.error.message } : null}
        onRetry={keysQ.refetch}
        columns={columns}
        emptyTitle={t("noHits")}
        emptyDescription="No API keys created yet."
        emptyAction={
          <Button
            variant="secondary"
            onClick={() =>
              document
                .querySelector<HTMLInputElement>('[placeholder="Key label"]')
                ?.focus()
            }
          >
            {t("createKey")}
          </Button>
        }
        rowKey={(k) => k.id}
      />
    </div>
  );
}
