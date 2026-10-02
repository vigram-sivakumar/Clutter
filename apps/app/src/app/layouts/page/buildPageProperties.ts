import type { PropertyListItem } from '@components/property-list/PropertyList';
import type { PropertyActions } from '@components/property-list/PropertyList.types';
import type { CustomPropertyType } from '@core/properties/Property.types';
import { systemPropertyLabel } from '@core/properties/systemProperties';
import type { SystemPropertyKey } from '@core/properties/systemProperties';
import type { Page } from '@core/vault/models/Page';
import type { MultiSelectSuggestion } from '@components/property-list/PropertyList.types';
import type { GetTagSuggestions } from '@features/markdown/editor/codemirror/tag/tagSuggestion';
import { readVisibleProperties } from '@core/vault/ingest/frontmatter/propertyVisibility';
import {
  readCustomProperties,
  toCustomUrl,
  validateCustomPropertyName,
  type CustomFrontmatterProperty,
  type CustomScalarType,
  type CustomScalarValue,
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
 * component). The same rules for a Note and a Daily Note.
 *
 * Nothing is shown by default. A Property is listed only when its
 * canonical key — a system key (`tags`, `aliases`, `created`, `modified`)
 * or a custom property's actual frontmatter key, never a UI label — is in
 * the note's `properties.visible` (propertyVisibility.ts), and the rows
 * follow that list's order. Visibility is separate from the property's
 * existence and value: an unlisted property keeps its frontmatter value,
 * and a listed custom key that isn't in the frontmatter shows nothing.
 *
 * Being present in frontmatter does not make a field a Property. Excluded
 * on purpose: fields with dedicated UI (favorite, icon, cover*, description),
 * system metadata (id, type, status, archive fields), and the Daily Note
 * date (already the title).
 *
 * `Tags` is note-level frontmatter membership (`tags`), independent of
 * inline `#tags` — a `tag` Property (pills), editable when the host
 * supplies `onCommitTags` and the page isn't archived. `Aliases` is the page's frontmatter `aliases`
 * (PageMetadata.aliases) — a `multi-select` Property (pills), editable when
 * the host supplies `aliases` actions and the page isn't archived (an
 * archived page is view-only). Plain text, never unique-checked: several
 * pages may share an alias. `Created`
 * and `Last edited` (the `modified` key) are system-maintained timestamps: `date` Properties
 * carrying the raw ISO timestamp (formatting is the date type's job),
 * explicitly `editable: false`.
 *
 * The custom properties — frontmatter keys Clutter doesn't own (never the
 * reserved `properties`), read from the page's preserved raw lines
 * (readCustomProperties), each a Property of its inferred type, with an editable name; read-only values
 * except a list when `onCommitListValue` is supplied.
 *
 * Editability is decided here, per Property — never by PropertyList from a
 * type or name. Only Tags', Aliases' and custom list values, and custom
 * properties' names, are editable so far; system Property names never are.
 *
 * `actions` carries the page-level behaviors a Property can trigger — kept
 * out of `page` so this stays a pure policy function. `onOpenTag` makes the
 * Tags pills open their Tag Collection; `aliases` makes Aliases editable.
 */
/**
 * A custom property being added, held in the UI only: from "Add
 * properties → <type>" until it has a name. Without a `name` it is an
 * unnamed row waiting for one; with one, the property is being written
 * and the row shows it until the page reflects it. Never persisted by
 * itself — an unnamed draft that is abandoned leaves nothing behind.
 */
export interface PropertyDraft {
  readonly id: number;
  readonly type: CustomPropertyType;
  readonly name?: string;
}

/** The add-property drafts a host manages, and how a draft is named or abandoned. */
export interface PropertyDraftActions {
  items: readonly PropertyDraft[];
  /** The draft got a valid, unique name: the host persists the property and drops the draft. */
  onName(id: number, name: string): void;
  /** The draft's naming ended without a valid name: the host drops it. */
  onAbandon(id: number): void;
}

/** A read-only, empty row of `type` — a draft's value cell until the property exists. */
function emptyItem(type: CustomPropertyType, name: string): PropertyListItem {
  switch (type) {
    case 'text':
      return { name, type, value: '', editable: false };
    case 'number':
    case 'date':
    case 'url':
      return { name, type, value: null, editable: false };
    case 'boolean':
      return { name, type, value: false, editable: false };
    case 'multi-select':
      return { name, type, value: [], editable: false };
  }
}

/** `item` with the menu actions that are available (see PropertyActions) — none when none is. */
function withActions(item: PropertyListItem, actions: PropertyActions): PropertyListItem {
  return {
    ...item,
    ...(actions.onHide && { onHide: actions.onHide }),
    ...(actions.onClear && { onClear: actions.onClear }),
    ...(actions.onDelete && { onDelete: actions.onDelete }),
  };
}

/** The writes a custom property's value can be given — each present only when the host can perform it. */
interface CustomPropertyValueActions {
  onRemoveListItem?(key: string, index: number, value: string): void;
  onCommitListValue?(key: string, value: string[]): void;
  /** Sets (or, with null, clears) a scalar's value, written as `type`. */
  onSetScalarValue?(key: string, type: CustomScalarType, value: CustomScalarValue | null): void;
}

/**
 * A custom property as a Property of the type its value implies (a list
 * renders as multi-select pills). A value is editable only when the host
 * supplies the write for it — `onCommitListValue` for a list,
 * `onSetScalarValue` for the rest — never because of its type. Without
 * it a scalar is read-only, and a list's pills are only dismissable.
 */
function toCustomPropertyItem(
  property: CustomFrontmatterProperty,
  { onRemoveListItem, onCommitListValue, onSetScalarValue }: CustomPropertyValueActions
): PropertyListItem {
  const { key } = property;
  const set = onSetScalarValue && ((type: CustomScalarType, value: CustomScalarValue | null) =>
    onSetScalarValue(key, type, value));

  switch (property.type) {
    case 'list':
      if (onCommitListValue) {
        return {
          name: key,
          type: 'multi-select',
          value: property.value,
          editable: true,
          onCommit: (value) => onCommitListValue(key, value),
        };
      }

      return {
        name: key,
        type: 'multi-select',
        value: property.value,
        // Pills are dismissable, like Tags' and Aliases'; adding isn't.
        ...(onRemoveListItem && {
          onRemoveValue: (index: number, value: string) => onRemoveListItem(key, index, value),
        }),
        editable: false,
      };
    case 'text':
      return set
        ? {
            name: key,
            type: 'text',
            value: property.value,
            editable: true,
            // An emptied text value is no value (`key:`).
            onCommit: (value) => set('text', value.trim() === '' ? null : value),
          }
        : { name: key, type: 'text', value: property.value, editable: false };
    case 'number':
      return set
        ? {
            name: key,
            type: 'number',
            value: property.value,
            editable: true,
            onCommit: (value) => set('number', value),
          }
        : { name: key, type: 'number', value: property.value, editable: false };
    case 'boolean':
      return set
        ? {
            name: key,
            type: 'boolean',
            value: property.value,
            editable: true,
            onCommit: (value) => set('boolean', value),
          }
        : { name: key, type: 'boolean', value: property.value, editable: false };
    case 'date':
      return set
        ? {
            name: key,
            type: 'date',
            value: property.value,
            editable: true,
            onCommit: (value) => set('date', value),
          }
        : { name: key, type: 'date', value: property.value, editable: false };
    case 'url':
      return set
        ? {
            name: key,
            type: 'url',
            value: property.value,
            editable: true,
            onCommit: (value) => {
              // Cleared, or a URL a stored value can be read back as one;
              // anything else is dropped (the value stays as it was).
              const stored = value === null ? null : toCustomUrl(value);

              if (value === null || stored !== null) {
                set('url', stored);
              }
            },
          }
        : { name: key, type: 'url', value: property.value, editable: false };
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
    /**
     * Persists the page's complete frontmatter tags (PageOperations
     * .updateMetadata). Present (and the page not archived): Tags is
     * editable — add, remove.
     */
    onCommitTags?(tags: string[]): void;
    /** Existing-tag autocomplete while typing in the editable Tags (createTagSuggester). */
    getTagSuggestions?: GetTagSuggestions;
    /**
     * Removes one item from a list custom property
     * (PageOperations.removeCustomPropertyItem). Present: its pills are
     * dismissable.
     */
    onRemoveListItem?(key: string, index: number, value: string): void;
    /**
     * Persists a list custom property's complete value
     * (PageOperations.setCustomPropertyList). Present (and the page not
     * archived): list custom properties are editable — add, edit, remove.
     */
    onCommitListValue?(key: string, value: string[]): void;
    /**
     * Persists a scalar custom property's value (PageOperations
     * .setCustomPropertyValue); null clears it, keeping its type. Present
     * (and the page not archived): text, number, boolean, date and url
     * custom properties are editable.
     */
    onSetScalarValue?(key: string, type: CustomScalarType, value: CustomScalarValue | null): void;
    /**
     * The custom properties being added (Add properties → a type), as
     * unnamed rows waiting for a name. Present (and the page not
     * archived): they are listed after the existing custom properties.
     */
    drafts?: PropertyDraftActions;
    /**
     * Stops showing a property (PageOperations.hideProperty), by its
     * canonical key. Present (and the page not archived): every listed
     * Property's menu offers Hide. Its value is untouched.
     */
    onHideProperty?(key: string): void;
    /**
     * Deletes a custom property from the frontmatter
     * (PageOperations.deleteCustomProperty), by its actual key. Present
     * (and the page not archived): a custom Property's menu offers Delete.
     * System Properties are never deletable.
     */
    onDeleteProperty?(key: string): void;
  } = {}
): PropertyListItem[] {
  const aliases = page.metadata.aliases ?? [];
  const isArchived = page.metadata.status === 'archived';
  const aliasActions = isArchived ? undefined : actions.aliases;
  const onRenameProperty = isArchived ? undefined : actions.onRenameProperty;
  const onCommitTags = isArchived ? undefined : actions.onCommitTags;
  const onRemoveListItem = isArchived ? undefined : actions.onRemoveListItem;
  const onCommitListValue = isArchived ? undefined : actions.onCommitListValue;
  const onSetScalarValue = isArchived ? undefined : actions.onSetScalarValue;
  const onHideProperty = isArchived ? undefined : actions.onHideProperty;
  const onDeleteProperty = isArchived ? undefined : actions.onDeleteProperty;
  const tags = page.metadata.tags ?? [];
  const customLines = page.metadata.unownedFrontmatter ?? [];

  // Custom properties: every frontmatter key Clutter doesn't own, after
  // the system ones, in file order. Their name is the key itself (system
  // Properties instead have a label separate from their canonical key),
  // and is renamable — rejected, with no write, by the same rule
  // PageOperations.renameCustomProperty enforces (reserved system keys in
  // any case, empty, unreadable, or another key on this page).
  // Nothing is shown by default: a Property is listed only when its
  // canonical key — the system key, or a custom property's actual
  // frontmatter key — is in `properties.visible`. Visibility is separate
  // from the property's existence and value.
  const visibleKeys = readVisibleProperties(customLines);
  const customItems = new Map<string, PropertyListItem>(
    readCustomProperties(customLines).map((property): [string, PropertyListItem] => {
      const { key } = property;
      const clear =
        property.type === 'list'
          ? onCommitListValue && (() => onCommitListValue(key, []))
          : onSetScalarValue &&
            // Emptied, keeping its type: a boolean's only empty state is unchecked.
            (() => onSetScalarValue(key, property.type, property.type === 'boolean' ? false : null));
      const item = withActions(
        toCustomPropertyItem(property, { onRemoveListItem, onCommitListValue, onSetScalarValue }),
        {
          onHide: onHideProperty && (() => onHideProperty(key)),
          onClear: clear,
          onDelete: onDeleteProperty && (() => onDeleteProperty(key)),
        }
      );

      if (!onRenameProperty) {
        return [property.key, item];
      }

      return [
        property.key,
        {
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
        },
      ];
    })
  );

  // Drafts: an unnamed row asks for its name — checked by the same rule a
  // rename uses, and against the names of drafts already being written — a
  // named one stands in for the property until the page shows it.
  const drafts = isArchived ? undefined : actions.drafts;
  const customKeys = new Set(readCustomProperties(customLines).map((property) => property.key.toLowerCase()));
  const pendingNames = (drafts?.items ?? []).flatMap((draft) => (draft.name === undefined ? [] : [draft.name]));
  const draftItems = (drafts?.items ?? []).flatMap((draft): PropertyListItem[] => {
    if (draft.name !== undefined) {
      return customKeys.has(draft.name.toLowerCase()) ? [] : [emptyItem(draft.type, draft.name)];
    }

    return [
      {
        ...emptyItem(draft.type, ''),
        onRename: (name) => {
          if (validateCustomPropertyName(customLines, '', name, pendingNames) !== null) {
            return false;
          }

          drafts!.onName(draft.id, name.trim());
          return true;
        },
        onAbandon: () => drafts!.onAbandon(draft.id),
      },
    ];
  });

  const systemRows: [SystemPropertyKey, PropertyListItem][] = [
    [
      'tags',
      onCommitTags
        ? {
            name: systemPropertyLabel('tags'),
            type: 'tag',
            value: tags,
            onOpenTag: actions.onOpenTag,
            getSuggestions: actions.getTagSuggestions,
            // Frontmatter `tags` only, never an inline #tag in the body: the
            // editor commits the whole new list (add or remove).
            editable: true,
            onCommit: onCommitTags,
          }
        : {
            name: systemPropertyLabel('tags'),
            type: 'tag',
            value: tags,
            onOpenTag: actions.onOpenTag,
            editable: false,
          },
    ],
    [
      'aliases',
      aliasActions
        ? {
            name: systemPropertyLabel('aliases'),
            type: 'multi-select',
            value: aliases,
            getSuggestions: aliasActions.getSuggestions,
            editable: true,
            onCommit: aliasActions.onCommit,
          }
        : { name: systemPropertyLabel('aliases'), type: 'multi-select', value: aliases, editable: false },
    ],
    [
      'created',
      { name: systemPropertyLabel('created'), type: 'date', value: page.metadata.createdAt, editable: false },
    ],
    [
      'modified',
      { name: systemPropertyLabel('modified'), type: 'date', value: page.metadata.updatedAt, editable: false },
    ],
  ];

  // Rows follow `properties.visible`, in the order the properties were
  // added to it: a listed system key, or a listed custom key that exists
  // in the frontmatter. A listed key that matches neither shows nothing.
  // Every system row can be hidden; Tags and Aliases can also be cleared.
  // Created and Last edited are system-maintained, so they can't be
  // cleared, and no system property can be deleted.
  const systemClear: Partial<Record<SystemPropertyKey, () => void>> = {
    tags: onCommitTags && (() => onCommitTags([])),
    aliases: aliasActions && (() => aliasActions.onCommit([])),
  };
  const systemItems = systemRows.map(([key, item]): [SystemPropertyKey, PropertyListItem] => [
    key,
    withActions(item, {
      onHide: onHideProperty && (() => onHideProperty(key)),
      onClear: systemClear[key],
    }),
  ]);
  const rowsByKey = new Map<string, PropertyListItem>([...systemItems, ...customItems]);
  const shownItems = [...new Set(visibleKeys)].flatMap((key) => {
    const item = rowsByKey.get(key);
    return item ? [item] : [];
  });

  return [...shownItems, ...draftItems];
}
