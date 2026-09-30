-- CreateTable (workflow_template was missing from baseline)
CREATE TABLE "workflow_template" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable (workflow_template_step was missing from baseline)
CREATE TABLE "workflow_template_step" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "stepName" TEXT NOT NULL,
    "assigneeRole" TEXT,
    "assigneeUserId" TEXT,
    "instructions" TEXT,

    CONSTRAINT "workflow_template_step_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (workflow_template)
CREATE UNIQUE INDEX "workflow_template_orgId_name_key" ON "workflow_template"("orgId", "name");
CREATE INDEX "workflow_template_orgId_idx" ON "workflow_template"("orgId");

-- CreateIndex (workflow_template_step)
CREATE UNIQUE INDEX "workflow_template_step_templateId_stepIndex_key" ON "workflow_template_step"("templateId", "stepIndex");
CREATE INDEX "workflow_template_step_templateId_idx" ON "workflow_template_step"("templateId");

-- AddForeignKey (workflow_template → organization)
ALTER TABLE "workflow_template" ADD CONSTRAINT "workflow_template_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (workflow_template_step → workflow_template)
ALTER TABLE "workflow_template_step" ADD CONSTRAINT "workflow_template_step_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "workflow_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add templateId to workflow_instance
ALTER TABLE "workflow_instance" ADD COLUMN "templateId" TEXT;

-- AddForeignKey (workflow_instance → workflow_template)
ALTER TABLE "workflow_instance" ADD CONSTRAINT "workflow_instance_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "workflow_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: add assigneeUserId to workflow_step
ALTER TABLE "workflow_step" ADD COLUMN "assigneeUserId" TEXT;

-- AlterTable: fix assigneeRole nullability (was NOT NULL in baseline, should be nullable)
ALTER TABLE "workflow_step" ALTER COLUMN "assigneeRole" DROP NOT NULL;
