"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/page";
import { EmptyState } from "@/components/page/EmptyState";
import { Inbox } from "lucide-react";
import { IncidentsTable, type IncidentRow } from "./IncidentsTable";

interface IncidentsPageClientProps {
  incidents: IncidentRow[];
}

export function IncidentsPageClient({ incidents }: IncidentsPageClientProps) {
  const t = useTranslations("incident");
  const [showMerged, setShowMerged] = useState(false);

  const filtered = showMerged
    ? incidents
    : incidents.filter((inc) => !inc.mergedIntoId);

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumb={
          <Link href="/" className="text-secondary hover:text-primary">
            Dashboard
          </Link>
        }
      />
      <div className="mb-4 flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showMerged}
            onChange={(e) => setShowMerged(e.target.checked)}
            className="accent-primary"
          />
          {t("list.showMerged")}
        </label>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={t("list.empty")}
          description="When incidents are reported, they will appear here."
        />
      ) : (
        <IncidentsTable incidents={filtered} />
      )}
    </>
  );
}
