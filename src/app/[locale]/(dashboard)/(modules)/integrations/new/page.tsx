"use client";
import { useState } from "react";
import { Link, useRouter } from "@/i18n/routing";
import { trpc } from "@/lib/trpc/client";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/page";
import { FormLayout } from "@/components/page/FormLayout";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

const EVENT_OPTIONS = [
  { value: "usecase.approved", label: "Usecase Approved" },
  { value: "usecase.rejected", label: "Usecase Rejected" },
];

export default function NewWebhookPage() {
  const t = useTranslations("integrations");
  const router = useRouter();
  const create = trpc.integrations.createWebhook.useMutation({
    onSuccess: (data) => router.push(`/integrations/${data.id}`),
  });
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    "usecase.approved",
    "usecase.rejected",
  ]);

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  return (
    <>
      <PageHeader
        title={t("new")}
        description="Register a URL to receive real-time AIGP events"
        breadcrumb={
          <Link
            href="/integrations"
            className="text-secondary hover:text-primary"
          >
            {t("title")}
          </Link>
        }
      />

      <FormLayout
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ url, events: selectedEvents });
        }}
        onCancel={() => router.push("/integrations")}
        submitting={create.isPending}
        submitLabel={create.isPending ? "Creating..." : "Create Webhook"}
        cancelLabel="Cancel"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-primary">
              Endpoint URL
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-endpoint.com/webhook"
                invalid={!url.trim() && create.error ? true : false}
              />
            </label>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-primary">
              Events
            </label>
            <div className="space-y-2">
              {EVENT_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedEvents.includes(opt.value)}
                    onCheckedChange={() => toggleEvent(opt.value)}
                  />
                  <span className="text-sm text-primary">{opt.label}</span>
                  <code className="ml-1 text-xs text-tertiary">
                    {opt.value}
                  </code>
                </label>
              ))}
            </div>
          </div>

          {create.error && (
            <p className="text-sm text-danger">{create.error.message}</p>
          )}

          <div className="rounded-lg border border-accent-subtle bg-accent-subtle p-4">
            <h3 className="mb-1 text-sm font-medium text-accent">
              Signature Verification
            </h3>
            <p className="text-xs text-secondary">
              Each request includes{" "}
              <code className="text-xs font-mono">X-AIGP-Signature</code>{" "}
              (HMAC-SHA256),{" "}
              <code className="text-xs font-mono">X-AIGP-Event</code>, and{" "}
              <code className="text-xs font-mono">X-AIGP-Timestamp</code>{" "}
              headers. Verify by computing HMAC-SHA256 of the raw request body
              using your secret.
            </p>
          </div>
        </div>
      </FormLayout>
    </>
  );
}
