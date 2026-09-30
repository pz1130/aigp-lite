-- AlterTable
ALTER TABLE "vendor" ADD COLUMN     "dataResidency" TEXT,
ADD COLUMN     "contractRenewalDate" TIMESTAMP(3),
ADD COLUMN     "modelChangeNotice" BOOLEAN NOT NULL DEFAULT false;
