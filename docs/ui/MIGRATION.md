# UI Migration Checklist

When updating a page to the new design system, apply each step:

1. Wrap content with `<PageHeader title=... description=... action=<Primary CTA> />`.
2. Replace list views with `<DataTable>` (uses `<Table>` primitive under the hood).
3. Replace detail views with `<DetailLayout main={...} aside={...}>`.
4. Replace forms with `<FormLayout>` (single-step) or `<WizardLayout>` (multi-step).
5. Replace empty/loading/error UI with `<EmptyState>` / `<LoadingState>` / `<ErrorState>`.
6. Replace raw Tailwind palette classes (`bg-zinc-*`, `text-gray-*`, etc.) with token utilities.
7. Replace inline `<input>` / `<button>` / `<select>` markup with primitive components.
8. Replace `<table>` markup with `<Table>` primitive or `<DataTable>`.
9. Replace `new Date(...).toLocaleString()` calls with helpers from `@/lib/format/intl`.
10. Replace status/severity enum displays with `<Badge variant={...}>{t("namespace." + value)}</Badge>`.
11. Register page-specific Quick Actions via `useRegisterQuickActions(...)`.
12. Verify hover-only row actions (`opacity-0 group-hover:opacity-100`).

## Module Migration Status

| Module       | Status   | PR  |
| ------------ | -------- | --- |
| inventory    | migrated | #9  |
| risk         | migrated | #9  |
| policy       | migrated | #9  |
| workflow     | migrated | #9  |
| evidence     | migrated | #9  |
| audit        | migrated | #9  |
| maturity     | migrated | #9  |
| data-lineage | migrated | #9  |
| integrations | migrated | #9  |
| incidents    | migrated | #9  |
