"use client";
import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { trpc } from "@/lib/trpc/client";
import type { RouterInput } from "@/lib/trpc/types";
import type { Policy } from "@/lib/prisma";
import type { PolicyDescriptor } from "@/lib/policy-engine/types";
import { useTranslations } from "next-intl";
import { FormLayout } from "@/components/page";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PolicyAssistantPanel,
  type ApplyValues,
} from "@/components/policy-assistant/PolicyAssistantPanel";
import { RuleEditorHelper } from "@/components/policy/RuleEditorHelper";
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface PolicyFormProps {
  mode: "create" | "edit";
  policy?: Policy;
  samples?: PolicyDescriptor[];
}

export function PolicyForm({ mode, policy, samples }: PolicyFormProps) {
  const t = useTranslations("policy");
  const router = useRouter();
  const [name, setName] = useState(policy?.name ?? "");
  const [description, setDescription] = useState(policy?.description ?? "");
  const [ruleJson, setRuleJson] = useState(
    policy ? JSON.stringify(policy.ruleJson, null, 2) : "",
  );
  const [severity, setSeverity] = useState<string>(
    policy?.severity ?? "medium",
  );
  const [enforcementMode, setEnforcementMode] = useState<string>(
    policy?.enforcementMode ?? "warn",
  );
  const [scope, setScope] = useState<string>(policy?.scope ?? "both");
  const [enabled, setEnabled] = useState(policy?.enabled ?? true);
  const [jsonError, setJsonError] = useState("");

  const create = trpc.policy.create.useMutation({
    onSuccess: () => router.push("/policy"),
  });
  const update = trpc.policy.update.useMutation({
    onSuccess: () => router.push("/policy"),
  });

  function applyAssistantValues(v: ApplyValues) {
    setName(v.name);
    setDescription(v.description);
    setRuleJson(v.ruleJsonText);
    setSeverity(v.severity);
    setEnforcementMode(v.enforcementMode);
    setScope(v.scope);
    setJsonError("");
  }

  function insertSample(sample: PolicyDescriptor) {
    setName(sample.name);
    setSeverity(sample.severity);
    setEnforcementMode(sample.enforcementMode);
    setScope(sample.scope);
    setRuleJson(JSON.stringify(sample.ruleJson, null, 2));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let parsedRule: unknown;
    try {
      parsedRule = JSON.parse(ruleJson);
      setJsonError("");
    } catch {
      setJsonError("Invalid JSON");
      return;
    }
    const data: RouterInput["policy"]["create"] = {
      name,
      description,
      ruleJson: parsedRule,
      severity: severity as RouterInput["policy"]["create"]["severity"],
      enforcementMode:
        enforcementMode as RouterInput["policy"]["create"]["enforcementMode"],
      scope: scope as RouterInput["policy"]["create"]["scope"],
      enabled,
    };
    if (mode === "create") create.mutate(data);
    else update.mutate({ id: policy!.id, ...data });
  }

  return (
    <FormLayout
      onSubmit={handleSubmit}
      onCancel={() => router.push("/policy")}
      submitting={create.isPending || update.isPending}
      submitLabel={t("save")}
      cancelLabel="Cancel"
    >
      {mode === "create" && (
        <PolicyAssistantPanel onApply={applyAssistantValues} />
      )}
      {samples && samples.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-sm text-secondary">Insert sample:</span>
          {samples.map((s, i) => (
            <Button
              key={i}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => insertSample(s)}
            >
              {s.name}
            </Button>
          ))}
        </div>
      )}
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
          {t("fields.description")}
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-primary mb-1.5">
            {t("fields.severity")}
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{t("severity.low")}</SelectItem>
                <SelectItem value="medium">{t("severity.medium")}</SelectItem>
                <SelectItem value="high">{t("severity.high")}</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        <div>
          <label className="block text-sm text-primary mb-1.5">
            {t("fields.mode")}
            <Select value={enforcementMode} onValueChange={setEnforcementMode}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="block">{t("mode.block")}</SelectItem>
                <SelectItem value="warn">{t("mode.warn")}</SelectItem>
                <SelectItem value="log">{t("mode.log")}</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        <div>
          <label className="block text-sm text-primary mb-1.5">
            {t("fields.scope")}
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="input">{t("scope.input")}</SelectItem>
                <SelectItem value="output">{t("scope.output")}</SelectItem>
                <SelectItem value="both">{t("scope.both")}</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
      </div>
      <div>
        <label className="block text-sm text-primary mb-1.5">
          {t("fields.ruleJson")}
        </label>
        <RuleEditorHelper onInsert={setRuleJson} />
        <Textarea
          rows={8}
          value={ruleJson}
          onChange={(e) => setRuleJson(e.target.value)}
          className="font-mono text-xs mt-2"
          invalid={!!jsonError}
        />
        {jsonError && <p className="text-sm text-danger mt-1">{jsonError}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={enabled}
          onCheckedChange={(v) => setEnabled(v === true)}
          id="enabled"
        />
        <label htmlFor="enabled" className="text-sm text-primary">
          {t("fields.enabled")}
        </label>
      </div>
    </FormLayout>
  );
}
