"use client";
import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface Props {
  value: string;
  onChange: (model: string) => void;
  sampleModels?: string[];
  onDiscover: () => Promise<{ ok: boolean; models?: string[]; error?: string }>;
  disabled?: boolean;
  autoDiscoverOnMount?: boolean;
}

export function ModelPicker({
  value,
  onChange,
  sampleModels = [],
  onDiscover,
  disabled,
  autoDiscoverOnMount,
}: Props) {
  const t = useTranslations("provider.model");
  const [discovered, setDiscovered] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const autoDiscovered = useRef(false);

  async function discover() {
    setLoading(true);
    setError(null);
    try {
      const r = await onDiscover();
      if (!r.ok) {
        setError(r.error ?? t("discoverFailed"));
        setDiscovered(null);
      } else {
        setDiscovered(r.models ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (
      autoDiscoverOnMount &&
      !autoDiscovered.current &&
      !loading &&
      discovered === null
    ) {
      autoDiscovered.current = true;
      discover();
    }
  }, [autoDiscoverOnMount]);

  const options = discovered ?? sampleModels;
  const hasOptions = options.length > 0;
  const isCustom = !!value && hasOptions && !options.includes(value);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-sm font-medium">{t("label")}</label>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={discover}
          disabled={loading || disabled}
        >
          <Search size={12} />
          {loading
            ? t("discovering")
            : discovered
              ? t("rediscover")
              : t("discover")}
        </Button>
      </div>

      {hasOptions && (
        <Select
          value={isCustom ? "__custom__" : value}
          onValueChange={(v) => {
            if (v === "__custom__") return;
            onChange(v);
          }}
        >
          <SelectTrigger disabled={disabled}>
            <SelectValue placeholder={t("placeholder")} />
          </SelectTrigger>
          <SelectContent>
            {options.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
            {isCustom && (
              <SelectItem value="__custom__" disabled>
                {value} ({t("customSuffix")})
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      )}

      <Input
        type="text"
        aria-label={t("inputPlaceholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={t("inputPlaceholder")}
        className="font-mono text-xs"
      />

      {error && <p className="text-xs text-danger">{error}</p>}
      {discovered && discovered.length === 0 && !error && (
        <p className="text-xs text-tertiary">{t("noneFound")}</p>
      )}
      {discovered && discovered.length > 0 && (
        <p className="text-xs text-tertiary">
          {t("foundCount", { count: discovered.length })}
        </p>
      )}
    </div>
  );
}
