"use client";
import { useState } from "react";
import { Link } from "@/i18n/routing";
import { trpc } from "@/lib/trpc/client";
import { useTranslations } from "next-intl";
import { StreamLayout } from "@/components/page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";

export function Playground() {
  const t = useTranslations("policy");
  const conns = trpc.providerConnection.list.useQuery();
  const usecaseQ = trpc.inventory.list.useQuery();
  const [connectionId, setConnectionId] = useState("");
  const [usecaseId, setUsecaseId] = useState("");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("mock-model");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [hits, setHits] = useState<
    { type: "warn" | "blocked"; policyName: string; snippet: string }[]
  >([]);
  const [streaming, setStreaming] = useState(false);

  if (conns.data && conns.data.length === 0) {
    return (
      <EmptyState
        icon="shield"
        title="No provider connections"
        description="Create one to use the playground."
        action={
          <Link
            href="/integrations/providers/new"
            className="underline text-accent"
          >
            Create your first →
          </Link>
        }
      />
    );
  }

  async function send() {
    if (!key) {
      alert("paste an API key");
      return;
    }
    if (!connectionId) {
      alert("select a connection");
      return;
    }
    if (!usecaseId) {
      alert("select a production usecase");
      return;
    }
    setOutput("");
    setHits([]);
    setStreaming(true);
    const res = await fetch("/api/runtime/llm", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        connectionId,
        model,
        messages: [{ role: "user", content: input }],
        usecaseId,
      }),
    });
    if (!res.ok || !res.body) {
      const text = await res.text();
      setHits((h) => [
        ...h,
        { type: "blocked", policyName: "transport", snippet: text },
      ]);
      setStreaming(false);
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value);
      const blocks = buf.split("\n\n");
      buf = blocks.pop() ?? "";
      for (const blk of blocks) {
        const lines = blk.split("\n");
        const ev = lines.reduce((a: Record<string, string>, l: string) => {
          const [k, ...rest] = l.split(":");
          a[k.trim()] = rest.join(":").trim();
          return a;
        }, {});
        const data = ev.data ? JSON.parse(ev.data) : null;
        if (ev.event === "chunk") setOutput((o) => o + (data?.text ?? ""));
        else if (ev.event === "warn")
          setHits((h) => [
            ...h,
            {
              type: "warn",
              policyName: data?.policyName ?? "",
              snippet: data?.snippet ?? "",
            },
          ]);
        else if (ev.event === "blocked")
          setHits((h) => [
            ...h,
            {
              type: "blocked",
              policyName: data?.policyName ?? "",
              snippet: data?.snippet ?? "",
            },
          ]);
      }
    }
    setStreaming(false);
  }

  return (
    <StreamLayout
      input={
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input
              className="flex-1 font-mono text-xs min-w-0"
              placeholder={t("pasteKey")}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              aria-label="API key"
            />
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="(select connection)" />
              </SelectTrigger>
              <SelectContent>
                {(conns.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={usecaseId} onValueChange={setUsecaseId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="(select usecase)" />
              </SelectTrigger>
              <SelectContent>
                {(usecaseQ.data ?? [])
                  .filter((u) => u.lifecycleStage === "production")
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-40"
              placeholder="Model"
            />
          </div>
          <Textarea
            rows={4}
            placeholder={t("prompt")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <Button disabled={streaming} onClick={send}>
            {streaming ? t("streaming") : t("send")}
          </Button>
        </div>
      }
      output={output || <span className="text-tertiary">{t("streaming")}</span>}
      status={
        <div className="space-y-2">
          <h3 className="text-h4 font-semibold">{t("policyHits")}</h3>
          {hits.length === 0 && (
            <p className="text-sm text-secondary">{t("noHits")}</p>
          )}
          {hits.map((h, i) => (
            <div
              key={i}
              className={`rounded-md border p-3 text-xs ${h.type === "blocked" ? "border-danger-subtle bg-danger-subtle" : "border-warn-subtle bg-warn-subtle"}`}
            >
              <div className="font-mono">
                <Badge
                  variant={h.type === "blocked" ? "danger" : "warn"}
                  size="sm"
                >
                  {h.type.toUpperCase()}
                </Badge>
                {" — "}
                {h.policyName}
              </div>
              <div className="text-secondary mt-1">{h.snippet}</div>
            </div>
          ))}
        </div>
      }
    />
  );
}
