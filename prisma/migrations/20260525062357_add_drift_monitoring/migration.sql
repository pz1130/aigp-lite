-- CreateEnum
CREATE TYPE "DriftRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "drift_benchmark" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "threshold" DOUBLE PRECISION NOT NULL DEFAULT 7.0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drift_benchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drift_prompt" (
    "id" TEXT NOT NULL,
    "benchmarkId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "promptText" TEXT NOT NULL,
    "expectedBehavior" TEXT NOT NULL,
    "referenceOutput" TEXT,

    CONSTRAINT "drift_prompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drift_run" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "benchmarkId" TEXT NOT NULL,
    "targetProvider" TEXT NOT NULL,
    "targetModel" TEXT NOT NULL,
    "judgeModel" TEXT NOT NULL,
    "status" "DriftRunStatus" NOT NULL DEFAULT 'pending',
    "avgScore" DOUBLE PRECISION,
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "promptCount" INTEGER NOT NULL,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "drift_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drift_result" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actualOutput" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "judgment" TEXT NOT NULL,
    "targetLatencyMs" INTEGER,
    "targetTokens" INTEGER,
    "judgeLatencyMs" INTEGER,
    "judgeTokens" INTEGER,

    CONSTRAINT "drift_result_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drift_benchmark_orgId_idx" ON "drift_benchmark"("orgId");

-- CreateIndex
CREATE INDEX "drift_prompt_orgId_idx" ON "drift_prompt"("orgId");

-- CreateIndex
CREATE INDEX "drift_run_orgId_startedAt_idx" ON "drift_run"("orgId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "drift_run_orgId_benchmarkId_startedAt_idx" ON "drift_run"("orgId", "benchmarkId", "startedAt");

-- CreateIndex
CREATE INDEX "drift_result_orgId_idx" ON "drift_result"("orgId");

-- AddForeignKey
ALTER TABLE "drift_benchmark" ADD CONSTRAINT "drift_benchmark_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_benchmark" ADD CONSTRAINT "drift_benchmark_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_prompt" ADD CONSTRAINT "drift_prompt_benchmarkId_fkey" FOREIGN KEY ("benchmarkId") REFERENCES "drift_benchmark"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_prompt" ADD CONSTRAINT "drift_prompt_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_run" ADD CONSTRAINT "drift_run_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_run" ADD CONSTRAINT "drift_run_benchmarkId_fkey" FOREIGN KEY ("benchmarkId") REFERENCES "drift_benchmark"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_result" ADD CONSTRAINT "drift_result_runId_fkey" FOREIGN KEY ("runId") REFERENCES "drift_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_result" ADD CONSTRAINT "drift_result_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "drift_prompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_result" ADD CONSTRAINT "drift_result_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
