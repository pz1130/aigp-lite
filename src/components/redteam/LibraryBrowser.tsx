"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { CATEGORIES } from "@/lib/redteam/types";
import type { BuiltinPrompt } from "@/lib/redteam/types";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";

export function LibraryBrowser() {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<string>(CATEGORIES[0]);
  const [detailSlug, setDetailSlug] = useState<string | null>(null);

  const list = trpc.redteam.library.builtin.useQuery();
  const detail = trpc.redteam.library.builtinDetail.useQuery(
    { slug: detailSlug ?? "" },
    { enabled: !!detailSlug },
  );

  if (list.isLoading)
    return <p>{t("common.loading", { defaultValue: "Loading..." })}</p>;

  const { prompts = [] } = list.data ?? {};

  const byCategory = (cat: string) => prompts.filter((p) => p.category === cat);

  const currentPrompts = byCategory(activeTab);

  return (
    <div className="space-y-4">
      {/* category tabs */}
      <div className="flex gap-1 border-b">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setActiveTab(cat);
              setDetailSlug(null);
            }}
            className={`px-3 py-1.5 text-sm border-b-2 transition-colors cursor-pointer ${
              activeTab === cat
                ? "border-accent text-accent font-medium"
                : "border-transparent text-tertiary hover:text-primary"
            }`}
          >
            {cat.replace("_", " ")}
            <span className="ml-1 text-xs text-tertiary">
              ({byCategory(cat).length})
            </span>
          </button>
        ))}
      </div>

      {/* prompt rows */}
      {detailSlug ? (
        <BuiltinDetailView
          slug={detailSlug}
          data={detail.data}
          loading={detail.isLoading}
          onBack={() => setDetailSlug(null)}
        />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Slug</Th>
              <Th>Severity</Th>
              <Th>Checker</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {currentPrompts.length === 0 ? (
              <Tr>
                <Td colSpan={4} className="p-4 text-tertiary">
                  No prompts in this category.
                </Td>
              </Tr>
            ) : (
              currentPrompts.map((p) => (
                <Tr key={p.slug}>
                  <Td className="font-mono text-xs">{p.slug}</Td>
                  <Td>
                    <SeverityBadge severity={p.severity} />
                  </Td>
                  <Td className="text-xs text-tertiary">{p.checker}</Td>
                  <Td className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDetailSlug(p.slug)}
                      className="text-accent"
                    >
                      View
                    </Button>
                  </Td>
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    low: "bg-emerald-100 text-emerald-700",
    medium: "bg-yellow-100 text-yellow-700",
    high: "bg-orange-100 text-orange-700",
    critical: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${colors[severity] ?? "bg-muted"}`}
    >
      {severity}
    </span>
  );
}

function BuiltinDetailView({
  slug: _slug,
  data,
  loading,
  onBack,
}: {
  slug: string;
  data?: BuiltinPrompt;
  loading: boolean;
  onBack: () => void;
}) {
  if (loading) return <p>Loading detail...</p>;
  if (!data) return <p>Prompt not found.</p>;

  return (
    <div className="space-y-3 rounded border p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-semibold">{data.slug}</h3>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-tertiary"
          onClick={onBack}
        >
          Back
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <span className="text-tertiary">Category</span>
        <span>{data.category}</span>
        <SeverityBadge severity={data.severity} />

        <span className="text-tertiary">Checker</span>
        <span className="col-span-2 font-mono">{data.checker}</span>

        <span className="text-tertiary">Expected</span>
        <span className="col-span-2">{data.expectedBehavior}</span>

        {data.source && (
          <>
            <span className="text-tertiary">Source</span>
            <span className="col-span-2">{data.source}</span>
          </>
        )}
      </div>
      <div>
        <p className="mb-1 text-xs text-tertiary">Prompt Text</p>
        <pre className="whitespace-pre-wrap rounded-md bg-muted p-2 text-xs font-mono">
          {data.text}
        </pre>
      </div>
    </div>
  );
}
