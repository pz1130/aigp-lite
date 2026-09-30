"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc/client";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

const schema = z.object({
  name: z.string().min(1),
  autonomyLevel: z.enum([
    "assistant",
    "simple_agent",
    "collaborative_agent",
    "agent_ecosystem",
  ]),
  deploymentType: z.enum(["built", "blended", "embedded", "byo"]),
  description: z.string().default(""),
  modelCardMd: z.string().default(""),
  intendedUseMd: z.string().default(""),
  prohibitedUseMd: z.string().default(""),
});
// resolvers v5 types the resolver by the schema's input (defaults optional)
// and output (defaults applied) separately; useForm needs both generics.
type FormInput = z.input<typeof schema>;
type Form = z.output<typeof schema>;

export function UsecaseForm({
  initial,
  id,
}: {
  initial?: Partial<Form>;
  id?: string;
}) {
  const t = useTranslations("inventory");
  const router = useRouter();
  const create = trpc.inventory.create.useMutation();
  const update = trpc.inventory.update.useMutation();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      autonomyLevel: "assistant",
      deploymentType: "built",
      description: "",
      modelCardMd: "",
      intendedUseMd: "",
      prohibitedUseMd: "",
      ...initial,
    },
  });
  const md = watch("modelCardMd");
  const desc = watch("description");
  const intendedUse = watch("intendedUseMd");
  const prohibitedUse = watch("prohibitedUseMd");

  async function onSubmit(values: Form) {
    if (id) {
      await update.mutateAsync({ id, ...values });
      router.push(`/inventory/${id}`);
    } else {
      const created = await create.mutateAsync(values);
      router.push(`/inventory/${created.id}`);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-2xl">
      <div>
        <label className="block text-sm mb-1.5">
          {t("fields.name")}
          <Input {...register("name")} invalid={!!errors.name} />
        </label>
        {errors.name && (
          <p className="text-sm text-danger mt-1">{errors.name.message}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm mb-1.5">
            {t("fields.autonomyLevel")}
            <Select
              value={watch("autonomyLevel")}
              onValueChange={(v) =>
                setValue("autonomyLevel", v as Form["autonomyLevel"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  [
                    "assistant",
                    "simple_agent",
                    "collaborative_agent",
                    "agent_ecosystem",
                  ] as const
                ).map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`autonomy.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        <div>
          <label className="block text-sm mb-1.5">
            {t("fields.deploymentType")}
            <Select
              value={watch("deploymentType")}
              onValueChange={(v) =>
                setValue("deploymentType", v as Form["deploymentType"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["built", "blended", "embedded", "byo"] as const).map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`deploy.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-sm">{t("fields.description")}</label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={(desc ?? "").trim().length > 0}
            onClick={() =>
              setValue("description", t("descriptionTemplate"), {
                shouldDirty: true,
              })
            }
          >
            {t("useTemplate")}
          </Button>
        </div>
        <Textarea
          {...register("description")}
          rows={5}
          placeholder={t("fields.descriptionPlaceholder")}
          aria-label={t("fields.description")}
        />
        <p className="mt-1 text-xs text-tertiary">
          {t("fields.descriptionHelp")}
        </p>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-sm">{t("fields.intendedUse")}</label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={(intendedUse ?? "").trim().length > 0}
            onClick={() =>
              setValue("intendedUseMd", t("intendedUseTemplate"), {
                shouldDirty: true,
              })
            }
          >
            {t("useTemplate")}
          </Button>
        </div>
        <Textarea
          {...register("intendedUseMd")}
          rows={4}
          aria-label={t("fields.intendedUse")}
        />
        <p className="mt-1 text-xs text-tertiary">
          {t("fields.intendedUseHelp")}
        </p>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-sm">{t("fields.prohibitedUse")}</label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={(prohibitedUse ?? "").trim().length > 0}
            onClick={() =>
              setValue("prohibitedUseMd", t("prohibitedUseTemplate"), {
                shouldDirty: true,
              })
            }
          >
            {t("useTemplate")}
          </Button>
        </div>
        <Textarea
          {...register("prohibitedUseMd")}
          rows={4}
          aria-label={t("fields.prohibitedUse")}
        />
        <p className="mt-1 text-xs text-tertiary">
          {t("fields.prohibitedUseHelp")}
        </p>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-sm">{t("fields.modelCard")}</label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={(md ?? "").trim().length > 0}
            onClick={() =>
              setValue("modelCardMd", t("modelCardTemplate"), {
                shouldDirty: true,
              })
            }
          >
            {t("useTemplate")}
          </Button>
        </div>
        <div data-color-mode="light">
          <MDEditor
            value={md ?? ""}
            onChange={(v) => setValue("modelCardMd", v ?? "")}
            height={300}
            aria-label={t("fields.modelCard")}
          />
        </div>
        <p className="mt-1 text-xs text-tertiary">
          {t("fields.modelCardHelp")}
        </p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {id ? t("save") : t("new")}
        </Button>
      </div>
    </form>
  );
}
