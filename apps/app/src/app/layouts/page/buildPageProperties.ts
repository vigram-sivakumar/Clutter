import type { PropertyListItem } from '@components/property-list/PropertyList';
import type { Page } from '@core/vault/models/Page';
import type { MultiSelectSuggestion } from '@components/property-list/PropertyList.types';

/**
 * What the Aliases Property needs to be editable — supplied by the host,
 * which owns the write (PageOperations.updateMetadata) and the vault read.
 */
export interface AliasPropertyActions {
  /** Persists the page's whole new alias list. */
  onCommit(aliases: string[]): void;
  /** Autocomplete: pages matching the typed text (createAliasSuggester). */
  getSuggestions?(query: string): readonly MultiSelectSuggestion[];
}

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
 * tags write path exists. `Aliases` is the page's frontmatter `aliases`
 * (PageMetadata.aliases) — a `multi-select` Property (pills), editable when
 * the host supplies `aliases` actions and the page isn't archived (an
 * archived page is view-only). Plain text, never unique-checked: several
 * pages may share an alias. `Created`
 * and `Modified` are system-maintained timestamps: `date` Properties
 * carrying the raw ISO timestamp (formatting is the date type's job),
 * explicitly `editable: false`.
 *
 * Editability is decided here, per Property — never by PropertyList from a
 * type or name. Only Aliases is editable so far.
 *
 * `actions` carries the page-level behaviors a Property can trigger — kept
 * out of `page` so this stays a pure policy function. `onOpenTag` makes the
 * Tags pills open their Tag Collection; `aliases` makes Aliases editable.
 */
export function buildPageProperties(
  page: Page,
  actions: { onOpenTag?(name: string): void; aliases?: AliasPropertyActions } = {}
): PropertyListItem[] {
  const aliases = page.metadata.aliases ?? [];
  const aliasActions = page.metadata.status === 'archived' ? undefined : actions.aliases;

  return [
    {
      name: 'Tags',
      type: 'tag',
      value: page.metadata.tags ?? [],
      onOpenTag: actions.onOpenTag,
      editable: false,
    },
    aliasActions
      ? {
          name: 'Aliases',
          type: 'multi-select',
          value: aliases,
          getSuggestions: aliasActions.getSuggestions,
          editable: true,
          onCommit: aliasActions.onCommit,
        }
      : { name: 'Aliases', type: 'multi-select', value: aliases, editable: false },
    { name: 'Created', type: 'date', value: page.metadata.createdAt, editable: false },
    { name: 'Modified', type: 'date', value: page.metadata.updatedAt, editable: false },
  ];
}
