-- CreateEnum
CREATE TYPE "McpTransportType" AS ENUM ('stdio', 'http');

-- CreateEnum
CREATE TYPE "McpAuthType" AS ENUM ('none', 'token', 'oauth');

-- CreateEnum
CREATE TYPE "McpRiskTier" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "McpServerStatus" AS ENUM ('active', 'inactive', 'archived');

-- CreateTable
CREATE TABLE "mcp_server" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "endpoint" VARCHAR(500) NOT NULL,
    "transport" "McpTransportType" NOT NULL,
    "authType" "McpAuthType" NOT NULL DEFAULT 'none',
    "riskTier" "McpRiskTier" NOT NULL DEFAULT 'medium',
    "status" "McpServerStatus" NOT NULL DEFAULT 'active',
    "owner" VARCHAR(200),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_tool" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "riskTier" "McpRiskTier" NOT NULL,
    "inputSchema" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_tool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_tool_invocation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "toolId" TEXT,
    "toolName" VARCHAR(200) NOT NULL,
    "actorId" TEXT NOT NULL,
    "outcome" VARCHAR(20) NOT NULL,
    "consentGiven" BOOLEAN NOT NULL DEFAULT true,
    "inputSummary" TEXT,
    "outputSummary" TEXT,
    "latencyMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_tool_invocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mcp_server_orgId_status_idx" ON "mcp_server"("orgId", "status");

-- CreateIndex
CREATE INDEX "mcp_server_orgId_riskTier_idx" ON "mcp_server"("orgId", "riskTier");

-- CreateIndex
CREATE INDEX "mcp_tool_orgId_idx" ON "mcp_tool"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_tool_serverId_name_key" ON "mcp_tool"("serverId", "name");

-- CreateIndex
CREATE INDEX "mcp_tool_invocation_orgId_createdAt_idx" ON "mcp_tool_invocation"("orgId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "mcp_tool_invocation_orgId_serverId_createdAt_idx" ON "mcp_tool_invocation"("orgId", "serverId", "createdAt");

-- CreateIndex
CREATE INDEX "mcp_tool_invocation_orgId_actorId_createdAt_idx" ON "mcp_tool_invocation"("orgId", "actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "mcp_server" ADD CONSTRAINT "mcp_server_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_server" ADD CONSTRAINT "mcp_server_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_tool" ADD CONSTRAINT "mcp_tool_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "mcp_server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_tool" ADD CONSTRAINT "mcp_tool_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_tool_invocation" ADD CONSTRAINT "mcp_tool_invocation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_tool_invocation" ADD CONSTRAINT "mcp_tool_invocation_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "mcp_server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_tool_invocation" ADD CONSTRAINT "mcp_tool_invocation_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "mcp_tool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_tool_invocation" ADD CONSTRAINT "mcp_tool_invocation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
