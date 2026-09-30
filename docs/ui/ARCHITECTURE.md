# UI Architecture

## Token system

All visual styling resolves to CSS variables in `src/app/tokens.css`, exposed
as Tailwind utility classes via `@theme` in `globals.css`. Never use raw
Tailwind palette classes (`bg-zinc-*`, `text-gray-*`); always use the token
utility (`bg-app`, `text-secondary`, etc.).

## Primitives (`src/components/ui`)

18 components for atomic interactions:

- Layout: Card
- Interaction: Button, Input, Textarea, Select, Checkbox, Switch
- Overlay: Dialog, DropdownMenu, Popover, Tooltip, Toast
- Navigation: Tabs, CommandPalette
- Display: Badge, Table, Avatar, Skeleton, Icon

Each primitive is Radix-based (where applicable) for a11y and behavior, with
visual styling driven by tokens. Variants are declared with `cva`.

## Page layouts (`src/components/page`)

10 composite layout components:

- `PageHeader`: breadcrumb + h1 + description + primary action
- `FilterRow`: list-page filter bar
- `DataTable`: list table with empty/loading/error states and pagination
- `DetailLayout`: 2/3 + sticky 1/3 aside
- `FormLayout`: single-column form with sticky footer
- `WizardLayout`: multi-step wizard with step indicator
- `StreamLayout`: 3/2 input-output + status panel for SSE pages
- `EmptyState`, `LoadingState`, `ErrorState`: state placeholders

## Iconography

All icons from `lucide-react`, stroke-width 1.5, sized 14/16/20/24/32/48.
Wrap with `<Icon icon={X} size={N}>`. Module icons indexed by
`MODULE_ICONS` in `src/components/ui/icons.ts`.

## i18n

- All visible strings via `next-intl` `t()` — no hardcoded text in components.
- All status/severity/category enums via `t("namespace." + value)`.
- All dates/numbers via `src/lib/format/intl.ts` helpers, not raw `Intl`.
- `<html lang>` is set from the route locale so `:lang(zh-CN)` selectors
  apply; Chinese gets +1px body/small font sizes.
