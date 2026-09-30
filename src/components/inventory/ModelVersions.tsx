"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format/intl";

type Form = {
  version: string;
  modelCardMd: string;
  deployedAt: string;
};

export function ModelVersions({
  usecaseId,
  locale,
}: {
  usecaseId: string;
  locale?: string;
}) {
  const t = useTranslations("inventory");
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: versions = [], isLoading } =
    trpc.inventory.modelVersionList.useQuery({ usecaseId });
  const create = trpc.inventory.modelVersionCreate.useMutation({
    onSuccess: () => {
      utils.inventory.modelVersionList.invalidate({ usecaseId });
      setShowForm(false);
    },
  });
  const update = trpc.inventory.modelVersionUpdate.useMutation({
    onSuccess: () => {
      utils.inventory.modelVersionList.invalidate({ usecaseId });
      setEditingId(null);
    },
  });

  function AddForm() {
    const {
      register,
      handleSubmit,
      reset,
      formState: { errors, isSubmitting },
    } = useForm<Form>();
    return (
      <form
        onSubmit={handleSubmit(async (vals) => {
          await create.mutateAsync({
            usecaseId,
            version: vals.version,
            modelCardMd: vals.modelCardMd,
            deployedAt: vals.deployedAt
              ? new Date(vals.deployedAt).toISOString()
              : null,
          });
          reset();
        })}
        className="rounded-lg border border-border-default p-3 space-y-3"
      >
        <div className="flex gap-2">
          <Input
            {...register("version")}
            placeholder={t("version")}
            invalid={!!errors.version}
          />
          <Input {...register("deployedAt")} type="date" />
        </div>
        {errors.version && (
          <p className="text-xs text-danger">{errors.version.message}</p>
        )}
        <Textarea
          {...register("modelCardMd")}
          placeholder={t("fields.modelCard")}
          rows={3}
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {t("save")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowForm(false)}
          >
            {t("cancel")}
          </Button>
        </div>
      </form>
    );
  }

  function EditForm({
    id,
    version,
    modelCardMd,
    deployedAt,
  }: {
    id: string;
    version: string;
    modelCardMd: string;
    deployedAt: string | Date | null;
  }) {
    const {
      register,
      handleSubmit,
      formState: { errors, isSubmitting },
    } = useForm<Form>({
      defaultValues: {
        version,
        modelCardMd,
        deployedAt: deployedAt
          ? deployedAt instanceof Date
            ? deployedAt.toISOString().slice(0, 10)
            : deployedAt.slice(0, 10)
          : "",
      },
    });
    return (
      <form
        onSubmit={handleSubmit(async (vals) => {
          await update.mutateAsync({
            id,
            version: vals.version,
            modelCardMd: vals.modelCardMd,
            deployedAt: vals.deployedAt
              ? new Date(vals.deployedAt).toISOString()
              : null,
          });
        })}
        className="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-3"
      >
        <div className="flex gap-2">
          <Input {...register("version")} invalid={!!errors.version} />
          <Input {...register("deployedAt")} type="date" />
        </div>
        {errors.version && (
          <p className="text-xs text-danger">{errors.version.message}</p>
        )}
        <Textarea {...register("modelCardMd")} rows={3} />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {t("save")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditingId(null)}
          >
            {t("cancel")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("fields.modelVersions")}</h2>
        {!showForm && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowForm(true)}
          >
            {t("addVersion")}
          </Button>
        )}
      </div>

      {showForm && <AddForm />}

      {isLoading ? (
        <p className="text-sm text-tertiary">...</p>
      ) : versions.length === 0 && !showForm ? (
        <p className="text-sm text-tertiary">{t("noVersions")}</p>
      ) : (
        <div className="divide-y divide-border-default rounded-lg border border-border-default">
          {versions.map((v) => (
            <div key={v.id} className="px-4 py-3">
              {editingId === v.id ? (
                <EditForm
                  id={v.id}
                  version={v.version}
                  modelCardMd={v.modelCardMd}
                  deployedAt={v.deployedAt}
                />
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">{v.version}</p>
                    {v.deployedAt && (
                      <p className="text-xs text-secondary mt-0.5">
                        {t("deployedAt")}:{" "}
                        {formatDate(new Date(v.deployedAt), locale ?? "en")}
                      </p>
                    )}
                    {v.modelCardMd && (
                      <p className="text-xs text-tertiary mt-1 line-clamp-2">
                        {v.modelCardMd.slice(0, 100)}…
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(v.id)}
                    className="text-tertiary hover:text-primary"
                  >
                    {t("edit")}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
