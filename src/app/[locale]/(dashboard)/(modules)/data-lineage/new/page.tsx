"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";

const SENSITIVITY_OPTIONS = [
  "public",
  "internal",
  "confidential",
  "restricted",
] as const;
const ORIGIN_OPTIONS = [
  "first_party",
  "third_party",
  "public_dataset",
] as const;

export default function NewDataSourcePage() {
  const t = useTranslations("dataLineage");
  const router = useRouter();
  const create = trpc.dataLineage.create.useMutation({
    onSuccess: () => router.push("/data-lineage"),
  });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sensitivity, setSensitivity] =
    useState<(typeof SENSITIVITY_OPTIONS)[number]>("internal");
  const [origin, setOrigin] =
    useState<(typeof ORIGIN_OPTIONS)[number]>("first_party");

  return (
    <>
      <PageHeader
        title={t("new")}
        breadcrumb={
          <a
            href="/data-lineage"
            className="text-secondary hover:text-primary flex items-center gap-1"
          >
            <ArrowLeft size={14} />
            {t("title")}
          </a>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ name, description, sensitivity, origin });
        }}
        className="mx-auto max-w-xl"
      >
        <div className="rounded-xl border border-border-default bg-surface p-6 space-y-4">
          <div>
            <label className="block text-small font-medium text-secondary mb-1">
              {t("name")}
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="e.g. Customer Support Chat Logs"
              />
            </label>
          </div>

          <div>
            <label className="block text-small font-medium text-secondary mb-1">
              Description
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Describe the data source and its purpose..."
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-small font-medium text-secondary mb-1">
                {t("sensitivity")}
                <Select
                  value={sensitivity}
                  onValueChange={(v) =>
                    setSensitivity(v as (typeof SENSITIVITY_OPTIONS)[number])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SENSITIVITY_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`sensitivityLevels.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <div>
              <label className="block text-small font-medium text-secondary mb-1">
                {t("origin")}
                <Select
                  value={origin}
                  onValueChange={(v) =>
                    setOrigin(v as (typeof ORIGIN_OPTIONS)[number])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORIGIN_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o
                          .replace("_", " ")
                          .replace(/\b\w/g, (l) => l.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 -mx-6 mt-6 flex items-center justify-between border-t border-border-default bg-app/95 px-6 py-3 backdrop-blur">
          <Button
            variant="ghost"
            type="button"
            onClick={() => router.push("/data-lineage")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Creating..." : t("new")}
          </Button>
        </div>

        {create.error && (
          <p className="mt-2 text-sm text-danger">{create.error.message}</p>
        )}
      </form>
    </>
  );
}
