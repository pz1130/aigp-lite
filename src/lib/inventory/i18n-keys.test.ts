import { describe, it, expect } from "vitest";
import en from "../../../messages/en.json";
import zh from "../../../messages/zh.json";

const INVENTORY_KEYS = [
  "stages.deprecated",
  "deprecate.action",
  "deprecate.sunsetDate",
  "deprecate.reason",
  "deprecate.submit",
  "deprecate.bannerTitle",
  "deprecate.deprecatedBy",
  "deprecate.noSunset",
  "sunset.daysLeft",
  "sunset.overdue",
  "sunset.today",
];

const NOTIF_KEYS = ["usecaseDeprecated.title", "usecaseDeprecated.body"];

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

describe("deprecation i18n keys", () => {
  it.each(INVENTORY_KEYS)("en has inventory.%s", (k) => {
    const inv = (en as { inventory: Record<string, unknown> }).inventory;
    expect(has(inv, k)).toBe(true);
  });
  it.each(INVENTORY_KEYS)("zh has inventory.%s", (k) => {
    const inv = (zh as { inventory: Record<string, unknown> }).inventory;
    expect(has(inv, k)).toBe(true);
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
