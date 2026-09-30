/*
  Warnings:

  - You are about to drop the column `apiKey` on the `audit_sink` table. All the data in the column will be lost.
  - You are about to drop the column `token` on the `audit_sink` table. All the data in the column will be lost.
  - Made the column `description` on table `risk_framework` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "audit_sink" DROP COLUMN "apiKey",
DROP COLUMN "token",
ADD COLUMN     "secretsEncrypted" BYTEA;

-- AlterTable
ALTER TABLE "risk_framework" ALTER COLUMN "description" SET NOT NULL;
