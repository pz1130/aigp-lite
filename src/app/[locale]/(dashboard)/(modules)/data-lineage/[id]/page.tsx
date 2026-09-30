"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader, DetailLayout } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataSourceLinkedUsecasesSection } from "@/components/data-lineage/DataSourceLinkedUsecasesSection";
import { formatDate } from "@/lib/format/intl";
import { useTranslations } from "next-intl";
import { use } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const SENSITIVITY_VARIANT: Record<
  string,
  "danger" | "warn" | "info" | "neutral"
> = {
  restricted: "danger",
  confidential: "warn",
  internal: "info",
  public: "neutral",
};

export default function DataSourceDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("dataLineage");
  const router = useRouter();
  const { data: ds, isLoading } = trpc.dataLineage.byId.useQuery({ id });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteMutation = trpc.dataLineage.delete.useMutation({
    onSuccess: () => router.push("/data-lineage"),
  });

  if (isLoading) return <div />;
  if (!ds) return <div />;

  const main = (
    <>
      <dl className="rounded-xl border border-border-default bg-surface p-4 grid grid-cols-2 gap-4 text-body">
        <div>
          <dt className="text-secondary text-small">{t("sensitivity")}</dt>
          <dd className="mt-0.5">
            <Badge
              variant={SENSITIVITY_VARIANT[ds.sensitivity] ?? "neutral"}
              size="sm"
            >
              {t(`sensitivityLevels.${ds.sensitivity}`)}
            </Badge>
          </dd>
        </div>
        <div>
          <dt className="text-secondary text-small">{t("origin")}</dt>
          <dd className="text-primary">{ds.origin.replace("_", " ")}</dd>
        </div>
        <div>
          <dt className="text-secondary text-small">{t("created")}</dt>
          <dd className="text-primary">
            {formatDate(new Date(ds.createdAt), "en")}
          </dd>
        </div>
        <div>
          <dt className="text-secondary text-small">{t("linkedUsecases")}</dt>
          <dd className="text-primary">{ds.links?.length ?? 0}</dd>
        </div>
      </dl>

      <DataSourceLinkedUsecasesSection dataSourceId={ds.id} />
    </>
  );

  const aside = (
    <div className="flex flex-col gap-2">
      <Link
        href={`/data-lineage/${ds.id}/graph`}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-border-default bg-surface h-9 px-3.5 text-body font-medium text-primary hover:bg-muted"
      >
        {t("viewGraph")}
      </Link>
      <Button
        variant="danger"
        onClick={() => setShowDeleteConfirm(true)}
        disabled={deleteMutation.isPending}
      >
        {deleteMutation.isPending ? t("deleting") : t("delete")}
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader
        title={ds.name}
        description={ds.description ?? undefined}
        breadcrumb={
          <Link
            href="/data-lineage"
            className="text-secondary hover:text-primary"
          >
            {t("title")}
          </Link>
        }
        action={
          <Badge variant={SENSITIVITY_VARIANT[ds.sensitivity] ?? "neutral"}>
            {t(`sensitivityLevels.${ds.sensitivity}`)}
          </Badge>
        }
      />
      <DetailLayout main={main} aside={aside} />

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t("deleteConfirmTitle")}
        confirmLabel={t("delete")}
        variant="danger"
        onConfirm={() => {
          deleteMutation.mutate({ id: ds.id });
          setShowDeleteConfirm(false);
        }}
      />
    </>
  );
}
