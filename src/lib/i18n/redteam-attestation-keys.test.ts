import { describe, it, expect } from "vitest";
import en from "@/../messages/en.json";
import zh from "@/../messages/zh.json";

const REQUIRED = [
  "redteamAttestation.title",
  "redteamAttestation.disclaimer",
  "redteamAttestation.empty",
  "redteamAttestation.add",
  "redteamAttestation.attester",
  "redteamAttestation.scope",
  "redteamAttestation.attestedAt",
  "redteamAttestation.download",
  "redteamAttestation.delete",
  "redteamAttestation.uploadFailed",
  "dossier.checks.external_redteam.label",
  "dossier.checks.external_redteam.detail",
];

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value !== null && typeof value === "object" && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

describe("redteam attestation i18n keys", () => {
  for (const key of REQUIRED) {
    it(`en has ${key}`, () => {
      expect(typeof get(en, key)).toBe("string");
    });
    it(`zh has ${key}`, () => {
      expect(typeof get(zh, key)).toBe("string");
    });
  }
});
