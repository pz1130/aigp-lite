-- CreateEnum
CREATE TYPE "AuditSinkType" AS ENUM ('webhook', 'syslog');

-- DropForeignKey
ALTER TABLE "workflow_instance" DROP CONSTRAINT "workflow_instance_templateId_fkey";

-- DropIndex
DROP INDEX "policy_evaluation_hit_idx";

-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "prevHash" CHAR(64),
ADD COLUMN     "selfHash" CHAR(64),
ADD COLUMN     "seqNum" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "audit_sink" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AuditSinkType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "url" TEXT,
    "token" TEXT,
    "host" TEXT,
    "port" INTEGER,
    "protocol" TEXT DEFAULT 'udp',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_sink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_sink_orgId_enabled_idx" ON "audit_sink"("orgId", "enabled");

-- AddForeignKey
ALTER TABLE "audit_sink" ADD CONSTRAINT "audit_sink_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
