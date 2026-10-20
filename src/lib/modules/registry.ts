import type { ModuleConfig } from "./types";
import inventory from "@/app/[locale]/(dashboard)/(modules)/inventory/module.config";
import members from "@/app/[locale]/(dashboard)/(modules)/members/module.config";
import risk from "@/app/[locale]/(dashboard)/(modules)/risk/module.config";
import workflow from "@/app/[locale]/(dashboard)/(modules)/workflow/module.config";
import evidence from "@/app/[locale]/(dashboard)/(modules)/evidence/module.config";
import audit from "@/app/[locale]/(dashboard)/(modules)/audit/module.config";
import reports from "@/app/[locale]/(dashboard)/(modules)/reports/module.config";
import trustCenter from "@/app/[locale]/(dashboard)/(modules)/trust-center/module.config";

export const MODULES: readonly ModuleConfig[] = [
  inventory,
  members,
  risk,
  workflow,
  evidence,
  audit,
  reports,
  trustCenter,
];
