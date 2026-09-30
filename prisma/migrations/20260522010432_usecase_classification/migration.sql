-- CreateTable
CREATE TABLE "usecase_classification" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "usecaseId" TEXT NOT NULL,
    "domain" TEXT,
    "containsPii" BOOLEAN NOT NULL DEFAULT false,
    "dataSensitivity" TEXT,
    "automatedDecisionMaking" BOOLEAN NOT NULL DEFAULT false,
    "euAiActCategory" TEXT,
    "complianceTags" TEXT[],
    "suggestedRisks" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL DEFAULT '',
    "modelProvider" TEXT,
    "modelName" TEXT,
    "confidence" DOUBLE PRECISION,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedReason" TEXT NOT NULL,

    CONSTRAINT "usecase_classification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usecase_classification_usecaseId_key" ON "usecase_classification"("usecaseId");

-- CreateIndex
CREATE INDEX "usecase_classification_orgId_idx" ON "usecase_classification"("orgId");

-- AddForeignKey
ALTER TABLE "usecase_classification" ADD CONSTRAINT "usecase_classification_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_classification" ADD CONSTRAINT "usecase_classification_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
