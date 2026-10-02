import type { PropertyListItem } from '@components/property-list/PropertyList';
import type { Page } from '@core/vault/models/Page';

/**
 * The page → Properties policy layer: the one place that decides which
 * metadata is a user-facing Property, its label, and how its value is
 * normalized for PropertyList (which stays a dumb presentational
 * component). Same four Properties, same order, for a Note and a Daily Note.
 *
 * Being present in frontmatter does not make a field a Property. Excluded
 * on purpose: fields with dedicated UI (favorite, icon, cover*, description),
 * system metadata (id, type, status, archive fields), and the Daily Note
 * date (already the title).
 *
 * `Tags` is note-level frontmatter membership (`tags`), independent of
 * inline `#tags` — a `tag` Property (pills), read-only until a frontmatter
 * tags write path exists. `Aliases` come from the page's parsed analysis. `Created`
 * and `Modified` are system-maintained timestamps: `date` Properties
 * carrying the raw ISO timestamp (formatting is the date type's job),
 * explicitly `editable: false`.
 *
 * Editability is decided here, per Property — never by PropertyList from a
 * type or name. None of these four is editable yet.
 *
 * `actions` carries the page-level behaviors a Property can trigger — kept
 * out of `page` so this stays a pure policy function. `onOpenTag` makes the
 * Tags pills open their Tag Collection.
 */
export function buildPageProperties(
  page: Page,
  actions: { onOpenTag?(name: string): void } = {}
): PropertyListItem[] {
  return [
    {
      name: 'Tags',
      type: 'tag',
      value: page.metadata.tags ?? [],
      onOpenTag: actions.onOpenTag,
      editable: false,
    },
    {
      name: 'Aliases',
      type: 'multi-select',
      value: page.analysis.aliases.map((alias) => alias.value),
      editable: false,
    },
    { name: 'Created', type: 'date', value: page.metadata.createdAt, editable: false },
    { name: 'Modified', type: 'date', value: page.metadata.updatedAt, editable: false },
  ];
}
