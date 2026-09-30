-- CreateEnum
CREATE TYPE "McpSnapshotSource" AS ENUM ('polled', 'manual');

-- CreateEnum
CREATE TYPE "McpDriftStatus" AS ENUM ('none', 'pending_review');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'mcp_drift_alert';

-- AlterTable
ALTER TABLE "mcp_server" ADD COLUMN     "authTokenEnc" BYTEA,
ADD COLUMN     "baselineSnapshotId" TEXT,
ADD COLUMN     "driftStatus" "McpDriftStatus" NOT NULL DEFAULT 'none';

-- CreateTable
CREATE TABLE "mcp_tool_snapshot" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "toolsHash" VARCHAR(64) NOT NULL,
    "toolsJson" JSONB NOT NULL,
    "source" "McpSnapshotSource" NOT NULL,
    "capturedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_tool_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mcp_tool_snapshot_orgId_serverId_createdAt_idx" ON "mcp_tool_snapshot"("orgId", "serverId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "mcp_server" ADD CONSTRAINT "mcp_server_baselineSnapshotId_fkey" FOREIGN KEY ("baselineSnapshotId") REFERENCES "mcp_tool_snapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_tool_snapshot" ADD CONSTRAINT "mcp_tool_snapshot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_tool_snapshot" ADD CONSTRAINT "mcp_tool_snapshot_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "mcp_server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_tool_snapshot" ADD CONSTRAINT "mcp_tool_snapshot_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
