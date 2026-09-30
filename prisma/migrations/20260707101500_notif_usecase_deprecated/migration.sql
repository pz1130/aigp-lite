-- New notification type for the deprecation-lifecycle fanout.
-- ALTER TYPE ... ADD VALUE runs in its own migration on PostgreSQL 12+.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'usecase_deprecated';