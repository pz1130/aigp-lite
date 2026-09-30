"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { PageHeader } from "@/components/page/PageHeader";
import { CustomUpload } from "@/components/redteam/CustomUpload";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function CustomLibraryPage() {
  const t = useTranslations("redteam.library");
  const tRed = useTranslations("redteam");
  const q = trpc.redteam.library.customList.useQuery({});
  const del = trpc.redteam.library.customDelete.useMutation();
  const utils = trpc.useUtils();

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  function handleDelete(setName: string) {
    setDeleteTarget(setName);
  }

  return (
    <>
      <PageHeader
        title={t("customTitle", { defaultValue: "Custom Prompt Sets" })}
        breadcrumb={
          <Link
            href="/redteam/library"
            className="text-secondary hover:text-primary"
          >
            {tRed("library.title", { defaultValue: "Prompt Library" })}
          </Link>
        }
      />

      <section className="mb-8 rounded border p-4">
        <h2 className="mb-3 text-sm font-medium">
          {t("uploadNew", { defaultValue: "Upload New Set" })}
        </h2>
        <CustomUpload />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium">
          {t("existingSets", { defaultValue: "Existing Sets" })}
        </h2>
        {q.isLoading ? (
          <p className="text-sm text-tertiary">
            {t("loading", { defaultValue: "Loading..." })}
          </p>
        ) : q.data?.length === 0 ? (
          <p className="text-sm text-tertiary">
            {t("noSets", { defaultValue: "No custom prompt sets yet." })}
          </p>
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Set Name</Th>
                <Th>Prompts</Th>
                <Th>Created</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
              {q.data?.map((s) => (
                <Tr key={s.setName}>
                  <Td className="font-mono text-xs">{s.setName}</Td>
                  <Td className="text-tertiary">{s.promptId}</Td>
                  <Td className="text-tertiary">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </Td>
                  <Td className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(s.setName)}
                      disabled={del.isPending}
                      className="text-danger hover:text-danger"
                    >
                      Delete
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Delete prompt set "${deleteTarget}"?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) {
            del
              .mutateAsync({ setName: deleteTarget })
              .then(() => utils.redteam.library.customList.invalidate());
          }
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
