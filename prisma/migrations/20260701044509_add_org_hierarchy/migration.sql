-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "parentOrgId" TEXT;

-- AddForeignKey
ALTER TABLE "organization" ADD CONSTRAINT "organization_parentOrgId_fkey" FOREIGN KEY ("parentOrgId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
