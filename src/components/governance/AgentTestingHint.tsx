"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Icon } from "@/components/ui/icon";
import {
  Plug,
  MessageSquare,
  Wrench,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type AgentTestingLayer = "connect" | "mouth" | "hands" | "compliance";

// The app does not serve docs/; link to the doc on GitHub. Centralized so it is
// trivial to repoint if the repo moves.
const DOCS_BASE_URL =
  "https://github.com/pz1130/aigp-lite/blob/main/docs/user/";

const LAYER_META: Record<
  AgentTestingLayer,
  { icon: LucideIcon; href: string }
> = {
  connect: { icon: Plug, href: "/integrations/providers/new" },
  mouth: { icon: MessageSquare, href: "/redteam/runs/new" },
  hands: { icon: Wrench, href: "/mcp/new" },
  compliance: { icon: ShieldCheck, href: "/inventory/new" },
};

export function AgentTestingHint({ layer }: { layer: AgentTestingLayer }) {
  const t = useTranslations("agentTesting");
  const locale = useLocale();
  const { icon, href } = LAYER_META[layer];
  // Only zh has a separate translation; every other locale falls back to the
  // English .md (graceful degradation — add a .<locale>.md to extend).
  const docHref = `${DOCS_BASE_URL}testing-your-agent${
    locale === "zh" ? ".zh" : ""
  }.md`;

  return (
    <div className="flex min-h-60 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-default p-8 text-center">
      <Icon icon={icon} size={48} className="text-tertiary" aria-hidden />
      <h2 className="text-h3 mt-2">{t(`${layer}.title`)}</h2>
      <p className="max-w-[60ch] text-secondary text-small">
        {t(`${layer}.tests`)}
      </p>
      <p className="max-w-[60ch] text-tertiary text-small">
        {t(`${layer}.prereq`)}
      </p>
      <div className="mt-3 flex items-center gap-4">
        {/* next-intl typed routes only know statically-declared app paths; cast past it. */}
        <Link href={href as never} className="text-accent underline">
          {t(`${layer}.cta`)}
        </Link>
        <a
          href={docHref}
          target="_blank"
          rel="noreferrer"
          aria-label={`${t("learnMore")} — ${t(`${layer}.title`)}`}
          className="text-secondary underline"
        >
          {t("learnMore")}
        </a>
      </div>
    </div>
  );
}
