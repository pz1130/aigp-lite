-- AlterTable
ALTER TABLE "ai_usecase" ADD COLUMN     "intendedUseMd" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "prohibitedUseMd" TEXT NOT NULL DEFAULT '';
