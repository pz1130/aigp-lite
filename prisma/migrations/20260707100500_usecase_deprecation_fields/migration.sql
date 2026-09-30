-- Deprecation lifecycle metadata for AiUsecase. Additive, nullable columns
-- (deprecationReason defaults to '') — no enum change; 'deprecated' already exists.
-- IF NOT EXISTS: parallel branches may have added sunsetDate/deprecationReason first.
ALTER TABLE "ai_usecase" ADD COLUMN IF NOT EXISTS "sunsetDate" TIMESTAMP(3);
ALTER TABLE "ai_usecase" ADD COLUMN IF NOT EXISTS "deprecatedAt" TIMESTAMP(3);
ALTER TABLE "ai_usecase" ADD COLUMN IF NOT EXISTS "deprecatedById" TEXT;
ALTER TABLE "ai_usecase" ADD COLUMN IF NOT EXISTS "deprecationReason" TEXT NOT NULL DEFAULT '';