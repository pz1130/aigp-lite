import { describe, it, expect } from "vitest";
import en from "../../../messages/en.json";
import zh from "../../../messages/zh.json";

const DOSSIER_KEYS = [
  "requiredAtTier",
  "capability.badge",
  "capability.notAssessed",
  "capability.tierZero",
  "checks.capability_tier_assessed.label",
  "checks.capability_tier_assessed.detail",
  "state.needs_re_review",
  "goLive.boundFingerprint",
  "goLive.staleWarning",
];

const NOTIF_KEYS = [
  "goLiveDecision.staleApproval.title",
  "goLiveDecision.staleApproval.body",
];

const FRT_KEYS = ["effectiveTierSetting", "effectiveTierZero"];

function has(obj: Record<string, unknown>, dotted: string): boolean {
  return (
    dotted.split(".").reduce<unknown>((acc, k) => {
      if (acc && typeof acc === "object" && k in (acc as object)) {
        return (acc as Record<string, unknown>)[k];
      }
      return undefined;
    }, obj) !== undefined
  );
}

describe("RSP capability binding i18n keys", () => {
  it.each(DOSSIER_KEYS)("en has dossier.%s", (k) => {
    const d = (en as { dossier: Record<string, unknown> }).dossier;
    expect(has(d, k)).toBe(true);
  });
  it.each(DOSSIER_KEYS)("zh has dossier.%s", (k) => {
    const d = (zh as { dossier: Record<string, unknown> }).dossier;
    expect(has(d, k)).toBe(true);
  });
  it.each(FRT_KEYS)("en has frontierRiskTier.%s", (k) => {
    const f = (en as { frontierRiskTier: Record<string, unknown> })
      .frontierRiskTier;
    expect(has(f, k)).toBe(true);
  });
  it.each(FRT_KEYS)("zh has frontierRiskTier.%s", (k) => {
    const f = (zh as { frontierRiskTier: Record<string, unknown> })
      .frontierRiskTier;
    expect(has(f, k)).toBe(true);
  });
  it.each(NOTIF_KEYS)("en has notifications.%s", (k) => {
    const n = (en as { notifications: Record<string, unknown> }).notifications;
    expect(has(n, k)).toBe(true);
  });
  it.each(NOTIF_KEYS)("zh has notifications.%s", (k) => {
    const n = (zh as { notifications: Record<string, unknown> }).notifications;
    expect(has(n, k)).toBe(true);
  });
});
