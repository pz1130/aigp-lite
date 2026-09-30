"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function EvidencePackPanel({ usecaseId }: { usecaseId: string }) {
  const t = useTranslations("evidencePack");
  const utils = trpc.useUtils();
  const [framework, setFramework] = useState("nist-ai-rmf");
  const { data: packs, isLoading } = trpc.evidencePack.list.useQuery({
    usecaseId,
  });
  const generate = trpc.evidencePack.generate.useMutation({
    onSuccess: () => utils.evidencePack.list.invalidate({ usecaseId }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          className="text-sm border rounded px-2 py-1"
          value={framework}
          onChange={(e) => setFramework(e.target.value)}
        >
          <option value="nist-ai-rmf">NIST AI RMF</option>
          <option value="iso-42001">ISO 42001</option>
          <option value="iso-27001">ISO 27001</option>
          <option value="eu-ai-act">EU AI Act</option>
          <option value="soc2-type2">SOC 2 Type II</option>
        </select>
        <Button
          disabled={generate.isPending}
          onClick={() => generate.mutate({ usecaseId, framework })}
        >
          {t("generate")}
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {packs && packs.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}

      {packs && packs.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">{t("status")}</th>
              <th>{t("framework")}</th>
              <th>{t("hash")}</th>
              <th>{t("created")}</th>
              <th>{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {packs.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="py-1">{p.status}</td>
                <td>{p.framework ?? "—"}</td>
                <td className="font-mono text-xs">{p.packHash ?? "—"}</td>
                <td className="text-xs text-muted-foreground">
                  {new Date(p.createdAt).toLocaleString()}
                </td>
                <td>
                  {p.status === "ready" ? (
                    <a
                      className="text-primary text-xs underline"
                      href={`/api/evidence-pack/download?id=${p.id}`}
                    >
                      {t("download")}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
