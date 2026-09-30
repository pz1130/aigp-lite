-- AlterTable
ALTER TABLE "user" ADD COLUMN "oidcSubject" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "user_oidcSubject_key" ON "user"("oidcSubject");
