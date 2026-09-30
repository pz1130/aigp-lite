"use client";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Command } from "cmdk";
import { trpc } from "@/lib/trpc/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Direction = "training" | "inference_input" | "inference_output";

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked?: () => void;
}

interface FromUsecaseProps extends BaseProps {
  mode: "from-usecase";
  usecaseId: string;
}

interface FromDataSourceProps extends BaseProps {
  mode: "from-datasource";
  dataSourceId: string;
}

type Props = FromUsecaseProps | FromDataSourceProps;

export function LinkDataSourceDialog(props: Props) {
  const t = useTranslations("dataLineage");
  const utils = trpc.useUtils();
  const dsListQ = trpc.dataLineage.list.useQuery(undefined, {
    enabled: props.open && props.mode === "from-usecase",
  });
  const ucListQ = trpc.inventory.list.useQuery(undefined, {
    enabled: props.open && props.mode === "from-datasource",
  });

  const radioGroupId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [direction, setDirection] = useState<Direction>("training");
  const [purpose, setPurpose] = useState("");

  const invalidateOtherSide = () =>
    props.mode === "from-usecase"
      ? utils.dataLineage.byUsecase.invalidate({ usecaseId: props.usecaseId })
      : utils.dataLineage.byId.invalidate({ id: props.dataSourceId });

  const linkM = trpc.dataLineage.linkUsecase.useMutation({
    onSuccess: async () => {
      // Invalidate both sides so the picker, lists and graph stay coherent.
      await Promise.all([
        utils.dataLineage.list.invalidate(),
        invalidateOtherSide(),
      ]);
      reset();
      props.onLinked?.();
      props.onOpenChange(false);
    },
  });

  function reset() {
    setSelectedId(null);
    setDirection("training");
    setPurpose("");
  }

  function submit() {
    if (!selectedId) return;
    const usecaseId =
      props.mode === "from-usecase" ? props.usecaseId : selectedId;
    const dataSourceId =
      props.mode === "from-usecase" ? selectedId : props.dataSourceId;
    linkM.mutate({ usecaseId, dataSourceId, direction, purpose });
  }

  const items: { id: string; name: string }[] =
    props.mode === "from-usecase"
      ? (dsListQ.data ?? []).map((d) => ({ id: d.id, name: d.name }))
      : (ucListQ.data ?? []).map((u) => ({ id: u.id, name: u.name }));

  const pickerLabel =
    props.mode === "from-usecase"
      ? t("dialog.dataSource")
      : t("dialog.usecase");
  const title =
    props.mode === "from-usecase" ? t("action.link") : t("action.linkFromDs");

  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => {
        if (!o) reset();
        props.onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>

        <div className="space-y-4">
          <div>
            <label className="text-small text-secondary mb-1 block">
              {pickerLabel}
              <Command className="rounded-md border border-border-default">
                <Command.Input
                  placeholder={t("dialog.searchPlaceholder")}
                  className="w-full bg-transparent px-3 py-2 text-body outline-none border-b border-border-default"
                />
                <Command.List className="max-h-48 overflow-y-auto p-1">
                  <Command.Empty className="px-2 py-3 text-small text-tertiary">
                    {t("dialog.noResults")}
                  </Command.Empty>
                  {items.map((it) => (
                    <Command.Item
                      key={it.id}
                      value={it.name}
                      onSelect={() => setSelectedId(it.id)}
                      className="flex h-9 cursor-pointer items-center justify-between rounded px-2 text-body data-[selected]:bg-muted"
                    >
                      <span>{it.name}</span>
                      {selectedId === it.id && (
                        <span className="text-accent text-small">&#10003;</span>
                      )}
                    </Command.Item>
                  ))}
                </Command.List>
              </Command>
            </label>
          </div>

          <div>
            <label className="text-small text-secondary mb-1 block">
              {t("dialog.direction")}
            </label>
            <div className="flex flex-col gap-1">
              {(
                [
                  "training",
                  "inference_input",
                  "inference_output",
                ] as Direction[]
              ).map((d) => (
                <label
                  key={d}
                  className="inline-flex items-center gap-2 text-body"
                >
                  <input
                    type="radio"
                    name={radioGroupId}
                    value={d}
                    checked={direction === d}
                    onChange={() => setDirection(d)}
                  />
                  {t(`direction.${d}`)}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-small text-secondary mb-1 block">
              {t("dialog.purpose")}
              <Input
                maxLength={200}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder={t("dialog.purposeLabel")}
              />
            </label>
          </div>

          {linkM.error && (
            <p className="text-small text-danger">{linkM.error.message}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="secondary"
              onClick={() => props.onOpenChange(false)}
            >
              {t("dialog.cancel")}
            </Button>
            <Button onClick={submit} disabled={!selectedId || linkM.isPending}>
              {linkM.isPending ? "…" : t("dialog.submit")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
