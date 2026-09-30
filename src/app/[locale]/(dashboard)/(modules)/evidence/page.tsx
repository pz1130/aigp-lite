import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { PageHeader, DataTable } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/lib/format/intl";
import { Download } from "lucide-react";
import { UploadDialog } from "@/components/evidence/UploadDialog";
import { EvidencePreviewButton } from "@/components/evidence/EvidencePreviewButton";
import { hasPermission } from "@/lib/rbac/check";

export default async function EvidencePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const t = await getTranslations("evidence");

  const rows = await db.evidence.findMany({
    orderBy: { uploadedAt: "desc" },
    take: 50,
    include: {
      usecase: { select: { id: true, name: true } },
      control: { include: { framework: { select: { code: true } } } },
      uploadedBy: { select: { id: true, name: true, email: true } },
    },
  });

  const canUpload = hasPermission(ctx.role, "evidence.write");

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumb={
          <Link href="/" className="text-secondary hover:text-primary">
            Dashboard
          </Link>
        }
        action={canUpload ? <UploadDialog /> : undefined}
      />

      <DataTable
        rows={rows}
        columns={[
          {
            key: "filename",
            header: t("filename"),
            render: (row) => (
              <span className="font-mono text-xs">{row.filename}</span>
            ),
          },
          {
            key: "usecase",
            header: t("usecase"),
            render: (row) =>
              row.usecase?.name ?? <span className="text-tertiary">—</span>,
          },
          {
            key: "control",
            header: t("control"),
            render: (row) =>
              row.control ? (
                <span className="text-xs">
                  {row.control.framework.code}/{row.control.code}
                </span>
              ) : (
                <span className="text-tertiary">—</span>
              ),
          },
          {
            key: "mimeType",
            header: t("mimeType"),
            render: (row) => (
              <Badge variant="neutral" size="sm">
                {row.mimeType}
              </Badge>
            ),
          },
          {
            key: "size",
            header: t("size"),
            render: (row) => formatNumber(row.bytes, locale),
          },
          {
            key: "uploadedBy",
            header: t("uploadedBy"),
            render: (row) => row.uploadedBy.name ?? row.uploadedBy.email,
          },
          {
            key: "uploadedAt",
            header: t("uploadedAt"),
            render: (row) => formatDate(new Date(row.uploadedAt), locale),
          },
          {
            key: "actions",
            header: "",
            width: "160px",
            align: "right",
            render: (row) => (
              <div className="flex items-center justify-end gap-1">
                <EvidencePreviewButton
                  id={row.id}
                  filename={row.filename}
                  mimeType={row.mimeType}
                />
                <a href={`/api/evidence/download?id=${row.id}`}>
                  <Button variant="secondary" size="sm">
                    <Download size={12} />
                    {t("download")}
                  </Button>
                </a>
              </div>
            ),
          },
        ]}
        rowKey={(row) => row.id}
        emptyTitle={t("noEvidence")}
      />
    </>
  );
}
