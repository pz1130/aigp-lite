-- CreateTable
CREATE TABLE "framework_version" (
    "id" TEXT NOT NULL,
    "framework" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "framework_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "framework_version_framework_key" ON "framework_version"("framework");
