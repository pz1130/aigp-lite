"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/page/PageHeader";
import { ProviderCatalogPicker } from "@/components/integrations/providers/ProviderCatalogPicker";
import { ProviderConnectionForm } from "@/components/integrations/providers/ProviderConnectionForm";

export default function NewProviderPage() {
  const _t = useTranslations("integrations");
  const [slug, setSlug] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="New Provider"
        breadcrumb={
          <Link href="/providers" className="text-secondary hover:text-primary">
            AI Provider
          </Link>
        }
      />
      {slug ? (
        <ProviderConnectionForm
          catalogSlug={slug}
          onCancel={() => setSlug(null)}
        />
      ) : (
        <ProviderCatalogPicker onPick={setSlug} />
      )}
    </>
  );
}
