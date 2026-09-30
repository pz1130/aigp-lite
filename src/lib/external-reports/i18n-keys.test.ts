import { describe, it, expect } from "vitest";
import en from "@/../messages/en.json";
import zh from "@/../messages/zh.json";

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? flatten(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe("externalReports i18n parity", () => {
  it("en and zh have identical externalReports keys", () => {
    const enKeys = flatten(
      (en as Record<string, unknown>).externalReports as Record<
        string,
        unknown
      >,
    ).sort();
    const zhKeys = flatten(
      (zh as Record<string, unknown>).externalReports as Record<
        string,
        unknown
      >,
    ).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it("includes notification keys under notifications.externalReports", () => {
    const notifications = (en as Record<string, unknown>)
      .notifications as Record<string, unknown>;
    const er = notifications.externalReports as Record<string, unknown>;
    const received = er.received as Record<string, unknown>;
    expect(received.title).toBeTruthy();
    expect(received.body).toBeTruthy();
  });
});
