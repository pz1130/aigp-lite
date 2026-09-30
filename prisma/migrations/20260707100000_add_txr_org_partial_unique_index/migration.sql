-- Partial unique index: at most one TxrReport per (orgId, version) among org-level
-- (usecaseId IS NULL) reports. The table-level @@unique([orgId, usecaseId, version])
-- does not cover NULL usecaseId because Postgres treats NULLs as distinct.
CREATE UNIQUE INDEX "txr_report_org_null_usecase_version_key"
  ON "txr_report" ("orgId", "version")
  WHERE "usecaseId" IS NULL;