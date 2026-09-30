-- AlterTable
ALTER TABLE "evaluation" ADD COLUMN     "engine" TEXT NOT NULL DEFAULT 'builtin',
ADD COLUMN     "externalRunId" TEXT;
