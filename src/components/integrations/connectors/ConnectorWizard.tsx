"use client";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import {
  CATALOG,
  getIntegrationCatalogEntry,
} from "@/lib/integrations-ext/catalog";
import {
  SUBSCRIBABLE_EVENTS,
  type SubscribableEvent,
} from "@/lib/integrations-ext/types";
import { MaskedInput } from "@/components/integrations/providers/MaskedInput";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { IntegrationType } from "@/lib/prisma";

type Step = "pick" | "form";

export function ConnectorWizard() {
  const t = useTranslations();
  const tConn = useTranslations("integrations.connector");
  const router = useRouter();
  const searchParams = useSearchParams();

  const preselectedType = searchParams.get("type");
  const isValidPreselect = preselectedType
    ? CATALOG.some((e) => e.integrationType === preselectedType)
    : false;

  const [step, setStep] = useState<Step>(isValidPreselect ? "form" : "pick");
  const [type, setType] = useState<IntegrationType>(
    isValidPreselect ? (preselectedType as IntegrationType) : "slack_webhook",
  );
  const [name, setName] = useState("");
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<SubscribableEvent[]>([]);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = trpc.integrationsExt.create.useMutation();
  const utils = trpc.useUtils();

  if (step === "pick") {
    return (
      <>
        <PageHeader
          title={tConn("new")}
          description={tConn("pickDescription")}
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {CATALOG.map((e) => (
            <Button
              key={e.integrationType}
              variant="secondary"
              className="rounded-lg p-4 text-left h-auto"
              onClick={() => {
                setType(e.integrationType);
                setStep("form");
              }}
            >
              <div className="text-base font-semibold text-primary">
                {t(e.displayNameKey)}
              </div>
              <div className="mt-1 text-xs text-secondary">
                {t(e.descriptionKey)}
              </div>
              {e.inboundEnabled && (
                <div className="mt-2">
                  <Badge variant="success" size="sm">
                    {tConn("bidirectional")}
                  </Badge>
                </div>
              )}
            </Button>
          ))}
        </div>
      </>
    );
  }

  const entry = getIntegrationCatalogEntry(type);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const out = await create.mutateAsync({
        integrationType: type,
        name,
        credentials: creds,
        config,
        subscribedEvents: events as never,
      });
      await utils.integrationsExt.list.invalidate();
      if (out.inboundSecret) {
        setRevealedSecret(out.inboundSecret);
      } else {
        router.push("/integrations/connectors" as never);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function toggleEvent(ev: SubscribableEvent, checked: boolean) {
    setEvents((cur) => (checked ? [...cur, ev] : cur.filter((x) => x !== ev)));
  }

  return (
    <>
      <PageHeader
        title={t(entry.displayNameKey)}
        description={t(entry.descriptionKey)}
      />

      <form onSubmit={submit} className="max-w-xl space-y-4">
        <div>
          <label
            htmlFor="name"
            className="mb-1 block text-sm font-medium text-primary"
          >
            {tConn("field.name")} *
          </label>
          <Input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {entry.configFields.map((f) => (
          <div key={f.key}>
            <label
              htmlFor={`cfg-${f.key}`}
              className="mb-1 block text-sm font-medium text-primary"
            >
              {t(f.label)}
              {f.required && " *"}
            </label>
            <Input
              id={`cfg-${f.key}`}
              required={f.required}
              placeholder={f.placeholder}
              value={config[f.key] ?? ""}
              onChange={(e) =>
                setConfig((c) => ({ ...c, [f.key]: e.target.value }))
              }
            />
          </div>
        ))}

        {entry.credFields.map((f) =>
          f.secret ? (
            <MaskedInput
              key={f.key}
              name={f.key}
              label={t(f.label)}
              placeholder={f.placeholder}
              required={f.required}
              hasExistingValue={false}
              onChange={(v) => setCreds((c) => ({ ...c, [f.key]: v ?? "" }))}
            />
          ) : (
            <div key={f.key}>
              <label
                htmlFor={`cred-${f.key}`}
                className="mb-1 block text-sm font-medium text-primary"
              >
                {t(f.label)}
                {f.required && " *"}
              </label>
              <Input
                id={`cred-${f.key}`}
                required={f.required}
                value={creds[f.key] ?? ""}
                onChange={(e) =>
                  setCreds((c) => ({ ...c, [f.key]: e.target.value }))
                }
              />
            </div>
          ),
        )}

        <fieldset className="space-y-1.5 rounded-md border border-border-default bg-muted p-3">
          <legend className="text-sm font-medium text-primary">
            {tConn("field.events")}
          </legend>
          {SUBSCRIBABLE_EVENTS.map((ev) => (
            <label key={ev} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={events.includes(ev)}
                onCheckedChange={(v) => toggleEvent(ev, v === true)}
              />
              <span className="font-mono text-xs">{ev}</span>
            </label>
          ))}
        </fieldset>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-2">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={create.isPending}
          >
            {create.isPending ? t("common.loading") : t("common.create")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setStep("pick")}
          >
            {t("common.back")}
          </Button>
        </div>
      </form>

      <Dialog
        open={!!revealedSecret}
        onOpenChange={(v) => {
          if (!v) router.push("/integrations/connectors" as never);
        }}
      >
        <DialogContent>
          <DialogTitle>{tConn("servicenow.inboundSecretTitle")}</DialogTitle>
          <DialogDescription>
            {tConn("servicenow.inboundSecretHelp")}
          </DialogDescription>
          <Input
            readOnly
            value={revealedSecret ?? ""}
            className="font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="mt-4 flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={() => router.push("/integrations/connectors" as never)}
            >
              {tConn("servicenow.inboundSecretConfirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
