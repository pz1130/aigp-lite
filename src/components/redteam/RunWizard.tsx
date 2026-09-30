"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export function RunWizard() {
  const t = useTranslations("redteam");
  const router = useRouter();
  const conns = trpc.providerConnection.list.useQuery();
  const lib = trpc.redteam.library.builtin.useQuery();
  const customs = trpc.redteam.library.customList.useQuery({});
  const [connectionId, setConnectionId] = useState("");
  const [model, setModel] = useState("");
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [selectedCustom, setSelectedCustom] = useState<string[]>([]);
  const [judge, setJudge] = useState<"builtin" | "nemo">("builtin");
  const [submitting, setSubmitting] = useState(false);
  const usecases = trpc.inventory.list.useQuery();
  const NONE = "none";
  const [usecaseId, setUsecaseId] = useState(NONE);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const promptSourceIds = [
      ...selectedSlugs.map((s) => `builtin:${s}`),
      ...selectedCustom.map((id) => `custom:${id}`),
    ];
    const r = await fetch("/api/redteam/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        connectionId,
        model,
        promptSourceIds,
        judge,
        ...(usecaseId !== NONE ? { usecaseId } : {}),
      }),
    });
    if (!r.ok) {
      alert(await r.text());
      setSubmitting(false);
      return;
    }
    const { evaluationId } = await r.json();
    router.push(`/redteam/runs/${evaluationId}`);
  }

  const totalSelected = selectedSlugs.length + selectedCustom.length;

  return (
    <form onSubmit={start} className="max-w-2xl space-y-4">
      <Select value={connectionId} onValueChange={setConnectionId}>
        <SelectTrigger>
          <SelectValue placeholder="Provider connection" />
        </SelectTrigger>
        <SelectContent>
          {(conns.data ?? []).map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        required
        value={model}
        onChange={(e) => setModel(e.target.value)}
        placeholder="Model (e.g. gpt-4o)"
        aria-label="Model name"
      />

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="redteam-judge">
          {t("judgeLabel")}
        </label>
        <Select
          value={judge}
          onValueChange={(v) => setJudge(v as "builtin" | "nemo")}
        >
          <SelectTrigger id="redteam-judge" aria-label={t("judgeLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="builtin">{t("judgeBuiltin")}</SelectItem>
            <SelectItem value="nemo">{t("judgeNemo")}</SelectItem>
          </SelectContent>
        </Select>
        {judge === "nemo" && (
          <p className="text-xs text-muted-foreground mt-1">
            {t("judgeNemoHint")}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="redteam-usecase">
          {t("linkSystem.label")}
        </label>
        <Select value={usecaseId} onValueChange={setUsecaseId}>
          <SelectTrigger
            id="redteam-usecase"
            aria-label={t("linkSystem.label")}
          >
            <SelectValue placeholder={t("linkSystem.label")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("linkSystem.none")}</SelectItem>
            {(usecases.data ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <fieldset className="space-y-2 rounded border border-border-default p-3">
        <legend className="text-sm font-medium">Builtin prompts</legend>
        {lib.data?.engineEnabled && (
          <p className="text-xs text-muted-foreground mt-1">
            Moonshot engine runs by category using its own datasets; individual
            prompt selection only determines which categories to run.
          </p>
        )}
        {(
          [
            "jailbreak",
            "prompt_injection",
            "bias",
            "harmful",
            "pii_leak",
            "toxicity",
          ] as const
        ).map((cat) => (
          <details
            key={cat}
            className="rounded border border-border-default p-2"
          >
            <summary className="cursor-pointer text-sm">
              {cat.replace(/_/g, " ")} ({lib.data?.countsByCategory[cat] ?? 0})
            </summary>
            <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
              {(lib.data?.prompts ?? [])
                .filter((p) => p.category === cat)
                .map((p) => (
                  <label
                    key={p.slug}
                    className="flex items-center gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSlugs.includes(p.slug)}
                      onChange={(e) =>
                        setSelectedSlugs((c) =>
                          e.target.checked
                            ? [...c, p.slug]
                            : c.filter((x) => x !== p.slug),
                        )
                      }
                    />
                    <span className="font-mono">{p.slug}</span>
                    <span className="text-tertiary">{p.severity}</span>
                  </label>
                ))}
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-accent"
                onClick={() => {
                  const allInCat = (lib.data?.prompts ?? [])
                    .filter((p) => p.category === cat)
                    .map((p) => p.slug);
                  setSelectedSlugs((c) =>
                    Array.from(new Set([...c, ...allInCat])),
                  );
                }}
              >
                Select all in category
              </Button>
            </div>
          </details>
        ))}
      </fieldset>

      {customs.data && customs.data.length > 0 && (
        <fieldset className="space-y-1 rounded border border-border-default p-3">
          <legend className="text-sm font-medium">Custom prompts</legend>
          {customs.data.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={selectedCustom.includes(p.id)}
                onChange={(e) =>
                  setSelectedCustom((c) =>
                    e.target.checked
                      ? [...c, p.id]
                      : c.filter((x) => x !== p.id),
                  )
                }
              />
              <span className="font-mono">
                {p.setName}/{p.promptId}
              </span>
              <span className="text-tertiary">
                {p.category}/{p.severity}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <p className="text-sm text-tertiary">
        {totalSelected} prompt{totalSelected !== 1 ? "s" : ""} selected
      </p>

      <Button
        type="submit"
        disabled={submitting || totalSelected === 0 || !connectionId || !model}
        variant="primary"
        className="disabled:opacity-50"
      >
        {submitting ? "Starting..." : "Start run"}
      </Button>
    </form>
  );
}
