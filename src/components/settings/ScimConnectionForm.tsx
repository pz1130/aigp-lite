"use client";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormLayout } from "@/components/page";
import { Link } from "@/i18n/routing";

function parseRoleValueMap(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const [key, value] = line.split(":").map((s) => s.trim());
    if (key && value) map[key] = value;
  }
  return map;
}

function formatRoleValueMap(map: Record<string, string> | null): string {
  if (!map) return "";
  return Object.entries(map)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

export function ScimConnectionForm() {
  const t = useTranslations("scim");
  const utils = trpc.useUtils();
  const { data: connection, isLoading } = trpc.scim.get.useQuery();
  const { data: ssoConnection } = trpc.sso.get.useQuery();

  const [roleAttribute, setRoleAttribute] = useState("");
  const [roleValueMapText, setRoleValueMapText] = useState("");
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  // Static, client-constructed value the admin pastes into their IdP — not
  // stored server-side. Computed after mount to avoid an SSR/client origin
  // mismatch.
  const [endpointUrl, setEndpointUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setEndpointUrl(`${window.location.origin}/api/scim/v2`);
    }
  }, []);

  useEffect(() => {
    if (connection) {
      setRoleAttribute(connection.roleAttribute ?? "");
      setRoleValueMapText(formatRoleValueMap(connection.roleValueMap));
    }
  }, [connection]);

  const upsert = trpc.scim.upsert.useMutation({
    onSuccess: (result) => {
      utils.scim.get.invalidate();
      if (result.rawToken) setRevealedToken(result.rawToken);
    },
  });
  const rotate = trpc.scim.rotateToken.useMutation({
    onSuccess: (result) => {
      utils.scim.get.invalidate();
      setRevealedToken(result.rawToken);
    },
  });
  const toggle = trpc.scim.setEnabled.useMutation({
    onSuccess: () => utils.scim.get.invalidate(),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    upsert.mutate({
      roleAttribute: roleAttribute.trim() || null,
      roleValueMap: roleValueMapText.trim()
        ? parseRoleValueMap(roleValueMapText)
        : null,
    });
  }

  function handleRotate() {
    if (window.confirm(t("rotateConfirm"))) rotate.mutate();
  }

  if (isLoading)
    return <div className="text-sm text-secondary py-4">{t("loading")}</div>;

  // SCIM requires SSO to already be configured (enforced server-side too).
  // If neither an SSO nor a SCIM connection exists yet, block the form and
  // point the admin at /settings/sso instead of letting them hit a
  // confusing mutation error. An admin who already has a SCIM connection
  // should still be able to view/manage it (e.g. to disable it) regardless
  // of current SSO state.
  if (!ssoConnection && !connection) {
    return (
      <div className="rounded-md border border-border-default/60 bg-surface p-4 space-y-3">
        <p className="text-sm text-secondary">{t("ssoRequired")}</p>
        <Link href="/settings/sso">
          <Button type="button" variant="secondary">
            {t("ssoRequiredCta")}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <FormLayout
      onSubmit={handleSubmit}
      submitting={upsert.isPending}
      submitLabel={t("save")}
      cancelLabel={t("cancel")}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase text-secondary tracking-wide">
          {t("fields.endpointUrl")}
        </span>
        <Input readOnly value={endpointUrl} />
      </label>

      {!connection && !revealedToken && (
        <p className="text-sm text-secondary">{t("notConfigured")}</p>
      )}

      {connection && (
        <p className="text-sm text-secondary">
          {t("fields.tokenPrefix")}:{" "}
          <span className="font-mono">{connection.tokenPrefix}</span>
        </p>
      )}

      {revealedToken && (
        <div
          role="alert"
          className="rounded-md border border-border-default/60 bg-surface p-3 space-y-1"
        >
          <p className="text-sm font-medium text-primary">
            {t("tokenRevealTitle")}
          </p>
          <p className="text-xs text-secondary">{t("tokenRevealBody")}</p>
          <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
            {revealedToken}
          </code>
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase text-secondary tracking-wide">
          {t("fields.roleAttribute")}
        </span>
        <Input
          value={roleAttribute}
          onChange={(e) => setRoleAttribute(e.target.value)}
        />
        <span className="text-xs text-secondary">
          {t("fields.roleAttributeHint")}
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase text-secondary tracking-wide">
          {t("fields.roleValueMap")}
        </span>
        <Textarea
          className="min-h-24"
          value={roleValueMapText}
          onChange={(e) => setRoleValueMapText(e.target.value)}
        />
        <span className="text-xs text-secondary">
          {t("fields.roleValueMapHint")}
        </span>
      </label>

      {upsert.isSuccess && <p className="text-sm text-success">{t("saved")}</p>}
      {upsert.isError && (
        <p className="text-sm text-danger">{t("saveError")}</p>
      )}

      {connection && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handleRotate}
            disabled={rotate.isPending}
          >
            {t("rotateToken")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => toggle.mutate({ enabled: !connection.enabled })}
            disabled={toggle.isPending}
          >
            {connection.enabled ? t("disable") : t("enable")}
          </Button>
          <span className="text-sm text-secondary">
            {connection.enabled ? t("enabled") : t("disabled")}
          </span>
        </div>
      )}
    </FormLayout>
  );
}
