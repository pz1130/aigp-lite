"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import Link from "next/link";
import { PageHeader } from "@/components/page";
import { DetailLayout } from "@/components/page/DetailLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format/intl";
import { EyeOff, AlertTriangle } from "lucide-react";
import { use } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function WebhookDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("integrations");
  const locale = useLocale();
  const { data: wh, isLoading } = trpc.integrations.webhookById.useQuery({
    id,
  });
  const deleteMutation = trpc.integrations.deleteWebhook.useMutation({
    onSuccess: () => (window.location.href = "/integrations"),
  });
  const regenerateMutation = trpc.integrations.regenerateSecret.useMutation({
    onSuccess: (data) => setShowSecret(data.secret),
  });
  const [showSecret, setShowSecret] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const _updateMutation = trpc.integrations.updateWebhook.useMutation();

  if (isLoading)
    return <div className="py-8 text-center text-secondary">Loading...</div>;
  if (!wh)
    return (
      <div className="py-8 text-center text-danger">Webhook not found</div>
    );

  return (
    <>
      <PageHeader
        title="Webhook Endpoint"
        description={wh.url}
        breadcrumb={
          <Link
            href="/integrations"
            className="text-secondary hover:text-primary"
          >
            {t("title")}
          </Link>
        }
        action={
          <Button
            variant={enabled ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setEnabled(!enabled)}
          >
            {enabled ? t("active") : t("disabled")}
          </Button>
        }
      />

      <DetailLayout
        main={
          <>
            <section className="rounded-lg border border-border-default bg-surface p-4 space-y-4">
              <div>
                <label className="text-xs font-medium uppercase text-secondary tracking-wide">
                  {t("url")}
                  <Input
                    readOnly
                    value={wh.url}
                    className="mt-1 font-mono text-xs"
                  />
                </label>
              </div>
              <div>
                <label className="text-xs font-medium uppercase text-secondary tracking-wide">
                  {t("events")}
                </label>
                <p className="mt-1 text-small text-primary">
                  {Array.isArray(wh.events) ? wh.events.join(", ") : ""}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium uppercase text-secondary tracking-wide">
                  {t("status")}
                </label>
                <div className="mt-1">
                  <Badge variant={wh.enabled ? "success" : "neutral"} size="sm">
                    {wh.enabled ? t("active") : t("disabled")}
                  </Badge>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium uppercase text-secondary tracking-wide">
                  Created
                </label>
                <p className="mt-1 text-small text-primary">
                  {formatDate(new Date(wh.createdAt), locale)}
                </p>
              </div>
            </section>

            <section className="rounded-lg border border-border-default bg-surface p-4 space-y-3">
              <h2 className="text-sm font-semibold text-primary">Security</h2>

              {showSecret ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-md bg-inverse p-3">
                    <code className="text-xs text-accent font-mono break-all">
                      {showSecret}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowSecret(null)}
                    >
                      <EyeOff size={12} />
                      Hide
                    </Button>
                  </div>
                  <p className="flex items-center gap-1 text-xs text-danger">
                    <AlertTriangle size={12} />
                    This is the only time the secret will be shown. Store it
                    securely.
                  </p>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => regenerateMutation.mutate({ id: wh.id })}
                  disabled={regenerateMutation.isPending}
                >
                  {regenerateMutation.isPending
                    ? "Regenerating..."
                    : "Regenerate Secret"}
                </Button>
              )}
            </section>

            <section className="rounded-lg border border-accent-subtle bg-accent-subtle p-4">
              <h3 className="mb-1 text-sm font-medium text-accent">
                Testing Your Endpoint
              </h3>
              <p className="mb-2 text-xs text-secondary">
                Send a test event to verify your endpoint receives payloads
                correctly.
              </p>
              <p className="text-xs text-secondary font-mono">
                Headers: X-AIGP-Signature, X-AIGP-Event, X-AIGP-Timestamp
              </p>
            </section>
          </>
        }
        aside={
          <div className="space-y-3">
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Webhook"}
            </Button>
          </div>
        }
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete this webhook endpoint?"
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          deleteMutation.mutate({ id: wh.id });
          setShowDeleteConfirm(false);
        }}
      />
    </>
  );
}
