-- Add the 'deprecated' lifecycle stage. The org-level Transparency Report
-- portfolio filter (development, production, deprecated) references it, but the
-- baseline LifecycleStage enum only defined proposed/development/production/retired.
-- ALTER TYPE ... ADD VALUE is safe in its own migration on PostgreSQL 12+.
ALTER TYPE "LifecycleStage" ADD VALUE IF NOT EXISTS 'deprecated';
