-- CreateTable
CREATE TABLE "scim_connection" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "roleAttribute" TEXT,
    "roleValueMap" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "scim_connection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scim_connection_orgId_key" ON "scim_connection"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "scim_connection_tokenHash_key" ON "scim_connection"("tokenHash");

-- AddForeignKey
ALTER TABLE "scim_connection" ADD CONSTRAINT "scim_connection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
