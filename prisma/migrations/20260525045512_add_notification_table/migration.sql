-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('step_assigned', 'workflow_cancelled');

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "titleKey" TEXT NOT NULL,
    "bodyKey" TEXT NOT NULL,
    "paramsJson" JSONB NOT NULL,
    "linkHref" TEXT NOT NULL,
    "workflowInstanceId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_recipientUserId_readAt_createdAt_idx" ON "notification"("recipientUserId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "notification_orgId_idx" ON "notification"("orgId");

-- CreateIndex
CREATE INDEX "notification_workflowInstanceId_idx" ON "notification"("workflowInstanceId");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
