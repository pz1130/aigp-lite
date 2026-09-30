"use client";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormLayout } from "@/components/page";

interface FormState {
  issuer: string;
  clientId: string;
  buttonLabel: string;
  allowedDomains: string;
  enabled: boolean;
}

const EMPTY: FormState = {
  issuer: "",
  clientId: "",
  buttonLabel: "",
  allowedDomains: "",
  enabled: true,
};

export function SsoConnectionForm() {
  const t = useTranslations("sso");
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.sso.get.useQuery();
  const upsert = trpc.sso.upsert.useMutation({
    onSuccess: () => utils.sso.get.invalidate(),
  });
  const rotate = trpc.sso.rotateSecret.useMutation({
    onSuccess: () => utils.sso.get.invalidate(),
  });

  const [form, setForm] = useState<FormState>(EMPTY);
  // Secret for first-time create (no stored secret yet).
  const [secret, setSecret] = useState("");
  // Rotation of an existing secret.
  const [rotating, setRotating] = useState(false);
  const [newSecret, setNewSecret] = useState("");

  const hasConnection = !!data;
  const hasSecret = !!data?.hasSecret;

  useEffect(() => {
    if (data) {
      setForm({
        issuer: data.issuer,
        clientId: data.clientId,
        buttonLabel: data.buttonLabel ?? "",
        allowedDomains: (data.allowedDomains ?? []).join(", "),
        enabled: data.enabled,
      });
    }
  }, [data]);

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const allowedDomains = form.allowedDomains
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    upsert.mutate({
      issuer: form.issuer,
      clientId: form.clientId,
      buttonLabel: form.buttonLabel.trim() || null,
      allowedDomains,
      enabled: form.enabled,
      // Only send a secret on first-time create; updates preserve the stored one.
      ...(hasSecret ? {} : { clientSecret: secret }),
    });
  }

  function handleRotate() {
    if (!newSecret.trim()) return;
    rotate.mutate(
      { clientSecret: newSecret },
      {
        onSuccess: () => {
          setRotating(false);
          setNewSecret("");
        },
      },
    );
  }

  if (isLoading)
    return <div className="text-sm text-secondary py-4">{t("loading")}</div>;

  return (
    <FormLayout
      onSubmit={handleSubmit}
      submitting={upsert.isPending}
      submitLabel={t("save")}
      cancelLabel={t("cancel")}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase text-secondary tracking-wide">
          {t("fields.issuer")}
        </span>
        <Input
          type="url"
          required
          placeholder="https://idp.example.com"
          value={form.issuer}
          onChange={(e) => set("issuer", e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase text-secondary tracking-wide">
          {t("fields.clientId")}
        </span>
        <Input
          required
          value={form.clientId}
          onChange={(e) => set("clientId", e.target.value)}
        />
      </label>

      {/* Client secret: write-only. Masked once stored, with a Rotate control. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase text-secondary tracking-wide">
          {t("fields.clientSecret")}
        </span>
        {hasSecret ? (
          rotating ? (
            <div className="flex items-center gap-2">
              <Input
                type="password"
                placeholder={t("fields.newSecret")}
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
              />
              <Button
                type="button"
                onClick={handleRotate}
                disabled={rotate.isPending}
              >
                {t("rotateSave")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setRotating(false);
                  setNewSecret("");
                }}
              >
                {t("cancel")}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-secondary tracking-widest">
                ••••••••
              </span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRotating(true)}
              >
                {t("rotate")}
              </Button>
            </div>
          )
        ) : (
          <Input
            type="password"
            required
            placeholder={t("fields.clientSecret")}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        )}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase text-secondary tracking-wide">
          {t("fields.buttonLabel")}
        </span>
        <Input
          placeholder={t("fields.buttonLabelPlaceholder")}
          value={form.buttonLabel}
          onChange={(e) => set("buttonLabel", e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase text-secondary tracking-wide">
          {t("fields.allowedDomains")}
        </span>
        <Input
          placeholder="acme.com, sub.acme.com"
          value={form.allowedDomains}
          onChange={(e) => set("allowedDomains", e.target.value)}
        />
        <span className="text-xs text-secondary">
          {t("fields.allowedDomainsHint")}
        </span>
      </label>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="accent-primary"
          checked={form.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
        />
        <span className="text-sm text-primary">{t("fields.enabled")}</span>
      </label>

      {upsert.isSuccess && <p className="text-sm text-success">{t("saved")}</p>}
      {upsert.isError && (
        <p className="text-sm text-danger">{t("saveError")}</p>
      )}
      {rotate.isSuccess && (
        <p className="text-sm text-success">{t("rotated")}</p>
      )}
      {hasConnection && !data?.enabled && (
        <p className="text-sm text-warn">{t("disabledNotice")}</p>
      )}
    </FormLayout>
  );
}
