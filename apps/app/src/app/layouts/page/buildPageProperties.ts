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
 * inline `#tags`. `Aliases` come from the page's parsed analysis. `Created`
 * and `Modified` are system-maintained `date` properties, display-only;
 * they carry the raw ISO value and the registry formats it.
 *
 * Properties carry semantic `type` + `value` only; icon, formatting and the
 * future editor are resolved from `core/properties/PropertyTypeRegistry`.
 */
export function buildPageProperties(page: Page): PropertyListItem[] {
  return [
    { name: 'Tags', type: 'tag', value: page.metadata.tags ?? [] },
    {
      name: 'Aliases',
      type: 'multi-select',
      value: page.analysis.aliases.map((alias) => alias.value),
    },
    { name: 'Created', type: 'date', value: page.metadata.createdAt },
    { name: 'Modified', type: 'date', value: page.metadata.updatedAt },
  ];
}
