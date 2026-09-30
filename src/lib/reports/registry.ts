import type { ReportTemplate, ReportTemplateId } from "./types";
import { nistAiRmfTemplate } from "./templates/nist-ai-rmf";
import { iso27001Template } from "./templates/iso-27001";
import { soc2Type2Template } from "./templates/soc2-type2";
import { iso42001Template } from "./templates/iso-42001";
import { euAiActTemplate } from "./templates/eu-ai-act";
import { mindforgeTemplate } from "./templates/mindforge";

const REGISTRY: Record<ReportTemplateId, ReportTemplate> = {
  "nist-ai-rmf": nistAiRmfTemplate,
  "iso-27001": iso27001Template,
  "soc2-type2": soc2Type2Template,
  "iso-42001": iso42001Template,
  "eu-ai-act": euAiActTemplate,
  mindforge: mindforgeTemplate,
};

export function getTemplate(id: ReportTemplateId): ReportTemplate {
  const t = REGISTRY[id];
  if (!t) throw new Error(`unknown template ${id}`);
  return t;
}

export function listTemplates(): ReportTemplate[] {
  return Object.values(REGISTRY);
}
