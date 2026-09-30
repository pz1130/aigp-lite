// Re-encrypts all encrypted-at-rest columns from AIGP_ENCRYPTION_KEY_OLD to
// AIGP_ENCRYPTION_KEY. Offline operation: stop the app + worker first.
// Usage: pnpm crypto:rotate-key [--dry-run]
import "dotenv/config";
import { prisma } from "@/lib/db";
import { rotateAllTables } from "@/lib/crypto/rotate";

function parseKey(name: string): Buffer {
  const raw = process.env[name];
  if (!raw) {
    console.error(`[rotate] ${name} is required`);
    process.exit(1);
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    console.error(`[rotate] ${name} must base64-decode to exactly 32 bytes`);
    process.exit(1);
  }
  return buf;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const oldKey = parseKey("AIGP_ENCRYPTION_KEY_OLD");
  const newKey = parseKey("AIGP_ENCRYPTION_KEY");
  if (oldKey.equals(newKey)) {
    console.error(
      "[rotate] AIGP_ENCRYPTION_KEY_OLD equals AIGP_ENCRYPTION_KEY — set the NEW key in AIGP_ENCRYPTION_KEY first",
    );
    process.exit(1);
  }

  const results = await rotateAllTables(oldKey, newKey, { dryRun });

  let anyFailed = false;
  for (const r of results) {
    console.log(
      `[rotate] ${r.table}: rotated=${r.rotated} already=${r.already} failed=${r.failed.length}`,
    );
    if (r.failed.length > 0) {
      anyFailed = true;
      console.log(`[rotate]   failed ids: ${r.failed.join(", ")}`);
    }
  }
  if (dryRun) console.log("[rotate] dry-run: no changes were written");
  if (anyFailed) {
    console.error(
      "[rotate] some rows decrypted with neither key — inspect the failed ids above",
    );
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
