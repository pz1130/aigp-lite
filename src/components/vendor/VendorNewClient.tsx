"use client";
import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type VType = "model_provider" | "data_vendor" | "tooling_vendor";

export function VendorNewClient() {
  const t = useTranslations("vendor");
  const router = useRouter();
  const [name, setName] = useState("");
  const [vendorType, setVendorType] = useState<VType>("model_provider");
  const [dataResidency, setDataResidency] = useState("");
  const [contractRenewalDate, setContractRenewalDate] = useState("");
  const [modelChangeNotice, setModelChangeNotice] = useState(false);
  const create = trpc.vendor.create.useMutation({
    onSuccess: (rec) => router.push(`/vendors/${rec.id}`),
  });

  return (
    <div className="max-w-lg space-y-4">
      <label className="block space-y-1">
        <span className="text-sm">{t("name")}</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">{t("typeLabel")}</span>
        <Select
          value={vendorType}
          onValueChange={(v) => setVendorType(v as VType)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="model_provider">
              {t("type.model_provider")}
            </SelectItem>
            <SelectItem value="data_vendor">{t("type.data_vendor")}</SelectItem>
            <SelectItem value="tooling_vendor">
              {t("type.tooling_vendor")}
            </SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm">{t("dataResidency")}</span>
        <Input
          value={dataResidency}
          onChange={(e) => setDataResidency(e.target.value)}
          placeholder={t("dataResidencyPlaceholder")}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">{t("contractRenewalDate")}</span>
        <Input
          type="date"
          value={contractRenewalDate}
          onChange={(e) => setContractRenewalDate(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={modelChangeNotice}
          onChange={(e) => setModelChangeNotice(e.target.checked)}
        />
        <span>{t("modelChangeNotice")}</span>
      </label>
      <Button
        disabled={!name || create.isPending}
        onClick={() =>
          create.mutate({
            name,
            vendorType,
            dataResidency: dataResidency || null,
            contractRenewalDate: contractRenewalDate || null,
            modelChangeNotice,
          })
        }
      >
        {t("create")}
      </Button>
    </div>
  );
}
