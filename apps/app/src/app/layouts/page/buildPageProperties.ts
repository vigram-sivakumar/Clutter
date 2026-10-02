import type { PropertyListItem } from '@components/property-list/PropertyList';
import type { Page } from '@core/vault/models/Page';
import type { MultiSelectSuggestion } from '@components/property-list/PropertyList.types';
import {
  readCustomProperties,
  validateCustomPropertyName,
  type CustomFrontmatterProperty,
} from '@core/vault/ingest/frontmatter/customFrontmatter';

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
 * Then the custom properties — frontmatter keys Clutter doesn't own,
 * read from the page's preserved raw lines (readCustomProperties), each a
 * read-only Property of its inferred type, with an editable name.
 *
 * Editability is decided here, per Property — never by PropertyList from a
 * type or name. Only Aliases' value and custom properties' names are
 * editable so far; system Property names never are.
 *
 * `actions` carries the page-level behaviors a Property can trigger — kept
 * out of `page` so this stays a pure policy function. `onOpenTag` makes the
 * Tags pills open their Tag Collection; `aliases` makes Aliases editable.
 */
/**
 * A custom property as a read-only Property of the type its value implies
 * (a list renders as multi-select pills) — values aren't editable yet.
 */
function toCustomPropertyItem(property: CustomFrontmatterProperty): PropertyListItem {
  switch (property.type) {
    case 'list':
      return { name: property.key, type: 'multi-select', value: property.value, editable: false };
    case 'text':
      return { name: property.key, type: 'text', value: property.value, editable: false };
    case 'number':
      return { name: property.key, type: 'number', value: property.value, editable: false };
    case 'boolean':
      return { name: property.key, type: 'boolean', value: property.value, editable: false };
    case 'date':
      return { name: property.key, type: 'date', value: property.value, editable: false };
    case 'url':
      return { name: property.key, type: 'url', value: property.value, editable: false };
  }
}

export function buildPageProperties(
  page: Page,
  actions: {
    onOpenTag?(name: string): void;
    aliases?: AliasPropertyActions;
    /**
     * Persists a custom property's rename (PageOperations
     * .renameCustomProperty). Present (and the page not archived): custom
     * property names are editable.
     */
    onRenameProperty?(key: string, name: string): void;
  } = {}
): PropertyListItem[] {
  const aliases = page.metadata.aliases ?? [];
  const isArchived = page.metadata.status === 'archived';
  const aliasActions = isArchived ? undefined : actions.aliases;
  const onRenameProperty = isArchived ? undefined : actions.onRenameProperty;
  const customLines = page.metadata.unownedFrontmatter ?? [];

  // Custom properties: every frontmatter key Clutter doesn't own, after
  // the system ones, in file order. Their name is the key itself (system
  // Properties instead have a label separate from their canonical key),
  // and is renamable — rejected, with no write, by the same rule
  // PageOperations.renameCustomProperty enforces (reserved system keys in
  // any case, empty, unreadable, or another key on this page).
  const customItems = readCustomProperties(customLines).map((property): PropertyListItem => {
    const item = toCustomPropertyItem(property);

    if (!onRenameProperty) {
      return item;
    }

    return {
      ...item,
      onRename: (name) => {
        if (validateCustomPropertyName(customLines, property.key, name) !== null) {
          return false;
        }
        if (name.trim() !== property.key) {
          onRenameProperty(property.key, name.trim());
        }
        return true;
      },
    };
  });

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
    ...customItems,
  ];
}
