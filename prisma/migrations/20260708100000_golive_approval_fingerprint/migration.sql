-- Bind go-live approvals to capability tier + model version fingerprint (Gap 2).
ALTER TABLE "go_live_review"
  ADD COLUMN IF NOT EXISTS "boundTier" INTEGER,
  ADD COLUMN IF NOT EXISTS "boundModelRef" TEXT,
  ADD COLUMN IF NOT EXISTS "staleApproval" BOOLEAN NOT NULL DEFAULT false;