-- CreateEnum
CREATE TYPE "PolicyAssistantStatus" AS ENUM ('ok', 'needs_review', 'failed');

-- CreateTable
CREATE TABLE "policy_assistant_generation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "PolicyAssistantStatus" NOT NULL,
    "outputJson" JSONB NOT NULL,
    "providerType" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_assistant_generation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "policy_assistant_generation_orgId_createdAt_idx" ON "policy_assistant_generation"("orgId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "policy_assistant_generation_orgId_userId_createdAt_idx" ON "policy_assistant_generation"("orgId", "userId", "createdAt");

-- AddForeignKey
ALTER TABLE "policy_assistant_generation" ADD CONSTRAINT "policy_assistant_generation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_assistant_generation" ADD CONSTRAINT "policy_assistant_generation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
