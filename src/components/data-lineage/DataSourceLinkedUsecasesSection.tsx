"use client";
import { useState } from "react";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LinkDataSourceDialog } from "./LinkDataSourceDialog";

const DIRECTIONS = ["training", "inference_input", "inference_output"] as const;
type Direction = (typeof DIRECTIONS)[number];

export function DataSourceLinkedUsecasesSection({
  dataSourceId,
}: {
  dataSourceId: string;
}) {
  const t = useTranslations("dataLineage");
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<{
    usecaseId: string;
    dataSourceId: string;
    direction: Direction;
  } | null>(null);
  const dsQ = trpc.dataLineage.byId.useQuery({ id: dataSourceId });
  const unlinkM = trpc.dataLineage.unlinkUsecase.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.dataLineage.byId.invalidate({ id: dataSourceId }),
        utils.dataLineage.list.invalidate(),
      ]);
    },
  });

  const links = dsQ.data?.links ?? [];
  const grouped: Record<Direction, typeof links> = {
    training: [],
    inference_input: [],
    inference_output: [],
  };
  for (const l of links) grouped[l.direction as Direction]?.push(l);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-h3">{t("section.titleFromDs")}</h2>
        <Button size="sm" onClick={() => setOpen(true)}>
          + {t("action.linkFromDs")}
        </Button>
      </div>

      {links.length === 0 && (
        <p className="text-small text-tertiary">{t("section.emptyFromDs")}</p>
      )}

      <div className="space-y-4">
        {DIRECTIONS.map((dir) =>
          grouped[dir].length === 0 ? null : (
            <div key={dir}>
              <h3 className="text-small font-medium text-secondary mb-2">
                {t(`direction.${dir}`)}
              </h3>
              <ul className="rounded-lg border border-border-default divide-y divide-border-default">
                {grouped[dir].map((l) => (
                  <li
                    key={`${l.usecaseId}:${l.dataSourceId}:${l.direction}`}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <Link
                      href={`/inventory/${l.usecaseId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {l.usecase.name}
                    </Link>
                    {l.purpose && (
                      <span className="ml-2 text-small text-tertiary truncate">
                        — {l.purpose}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto p-1 text-tertiary hover:text-danger"
                      aria-label={t("action.unlink")}
                      onClick={() => {
                        setUnlinkTarget({
                          usecaseId: l.usecaseId,
                          dataSourceId: l.dataSourceId,
                          direction: l.direction,
                        });
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </div>

      <LinkDataSourceDialog
        mode="from-datasource"
        dataSourceId={dataSourceId}
        open={open}
        onOpenChange={setOpen}
      />

      <ConfirmDialog
        open={unlinkTarget !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setUnlinkTarget(null);
        }}
        title={t("dialog.confirmUnlink")}
        confirmLabel={t("action.unlink")}
        variant="danger"
        onConfirm={() => {
          if (unlinkTarget) {
            unlinkM.mutate({
              usecaseId: unlinkTarget.usecaseId,
              dataSourceId: unlinkTarget.dataSourceId,
              direction: unlinkTarget.direction,
            });
          }
          setUnlinkTarget(null);
        }}
      />
    </section>
  );
}
