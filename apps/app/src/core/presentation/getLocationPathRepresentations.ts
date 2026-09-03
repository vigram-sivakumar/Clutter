import { VaultPath } from '../vault/ingest/VaultPath';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';

/**
 * The three kinds of Vault-backed entity the location-actions pipeline
 * covers, collapsed to exactly the granularity Markdown representation
 * actually varies by — not the five product-facing entity names (Note,
 * Daily Note, Folder, Image, PDF). Note/Daily Note are both a `Page`
 * (`Vault.resolvePageType` derives `type` purely from path convention, see
 * `Vault.ts`'s `resolvePageType`) and share one WikiLink target shape;
 * Image/PDF are both a `VaultResource` and share one Embed target shape
 * (`resolveResourceEmbed.ts` already resolves `![[...]]` identically
 * regardless of `kind`). Folder has no target syntax at all — `[[`/`![[`
 * never resolve against `Vault.getFolderByPath`.
 */
export type LocationEntityKind = 'page' | 'folder' | 'resource';

export interface LocationPathRepresentations {
  /** Vault-relative path, e.g. `Assets/image.png`. */
  atVault: string;
  /** Absolute filesystem path — the entity's own `.path`, untouched. */
  fullPath: string;
  /**
   * WikiLink (`[[...]]`) or Embed (`![[...]]`) syntax, or `null` when this
   * entity kind has no meaningful Markdown representation (Folder — no
   * folder-linking syntax exists anywhere in the parser/resolver today).
   */
  asMarkdown: string | null;
}

/**
 * The three copyable representations of a Vault-backed entity's location
 * (the sidebar/topbar "Copy path" submenu) — derived from the entity's own
 * `.path` (already absolute for `Page`/`Folder`/`VaultResource` alike, see
 * `Page.ts`/`Folder.ts`/`ResourceBuilder.ts`) and the vault's own root,
 * never from a display name (`getPageDisplayLabel`/`getFolderDisplayLabel`/
 * `getResourceDisplayName`), which is stemmed/aliased and therefore not a
 * valid filesystem or Markdown target.
 *
 * Markdown target format mirrors the exact syntax the editor's own
 * resolvers already treat as canonical:
 * - page: vault-relative, `.md` stripped — `resolveWikiLink.ts`'s literal
 *   lookup (`vault.getPageByPath(\`${vault.root}/${path}.md\`)`) and
 *   `wikiLinkSuggestions.ts`'s own insertion format.
 * - resource: vault-relative, extension kept — `resolveResourceEmbed.ts`'s
 *   lookup, identical for image and pdf (no `kind` branch there).
 * - folder: no representation.
 */
export function getLocationPathRepresentations(
  entity: { path: string },
  kind: LocationEntityKind,
  vaultRoot: string
): LocationPathRepresentations {
  const atVault = VaultPath.relativeTo(entity.path, vaultRoot);

  const asMarkdown =
    kind === 'page'
      ? `[[${VaultPath.withoutExtension(atVault)}]]`
      : kind === 'resource'
        ? `![[${atVault}]]`
        : null;

  return {
    atVault,
    fullPath: entity.path,
    asMarkdown,
  };
}

/** The three "Copy path" submenu leaves — matches their `copy-path-*` item ids one-to-one. */
export type LocationPathFormat = 'at-vault' | 'full-path' | 'as-markdown';

/**
 * Picks the one representation a given "Copy path" submenu selection asked
 * for — the single place that mapping is made, so every call site (sidebar
 * Note/Folder/Resource rows, the topbar) dispatches through this instead of
 * restating the same three-way branch. Returns `null` for `'as-markdown'`
 * on an entity kind with none (Folder) — callers should never be able to
 * reach that case in practice, since `buildLocationActionMenuItems` never
 * offers the item for such a kind, but the type still models it honestly
 * rather than asserting it away.
 */
export function pickLocationPathRepresentation(
  representations: LocationPathRepresentations,
  format: LocationPathFormat
): string | null {
  switch (format) {
    case 'at-vault':
      return representations.atVault;
    case 'full-path':
      return representations.fullPath;
    case 'as-markdown':
      return representations.asMarkdown;
  }
}

/**
 * Whether `kind` has a Markdown representation at all — the single place
 * that decision is made, read both here (indirectly, via
 * `getLocationPathRepresentations`'s own `kind` switch) and by
 * `buildLocationActionMenuItems` below (to omit the "As Markdown" submenu
 * leaf for a Folder), so the two never drift out of sync.
 */
function hasMarkdownRepresentation(kind: LocationEntityKind): boolean {
  return kind !== 'folder';
}

/**
 * The "Reveal in Finder" / "Copy path" menu-item fragment shared by every
 * sidebar and topbar "More Actions" menu (`OverflowMenuItemConfig` is the
 * one shape both surfaces already build against — `ResourceTopBarActions`'s
 * `TopBarMenuItemConfig` is a literal alias of it). Callers splice this into
 * their own item list (conventionally just before a trailing Archive item,
 * matching the existing Note/Folder/Resource menu ordering) rather than
 * duplicating the Reveal/Copy-path item definitions per entity type.
 */
export function buildLocationActionMenuItems(
  kind: LocationEntityKind,
  options: {
    /**
     * Marks both items `disabled` instead of omitting them — the topbar's
     * "disabled, not omitted" convention for a draft (ADR-017 Decision
     * item 9, already applied to `move-to`/`archive` in
     * `noteTopBarMenu.config.ts`). The sidebar instead omits its entire
     * menu for a draft (`if (isDraft) return [];`), so its callers never
     * pass this.
     */
    disabled?: boolean;
  } = {}
): OverflowMenuItemConfig[] {
  const submenu = [
    { id: 'copy-path-at-vault', label: 'From vault' },
    { id: 'copy-path-full-path', label: 'Full path' },
    ...(hasMarkdownRepresentation(kind)
      ? [{ id: 'copy-path-as-markdown', label: 'As Markdown' }]
      : []),
  ];

  return [
    {
      id: 'reveal-in-finder',
      label: 'Reveal in Finder',
      icon: 'folder',
      disabled: options.disabled,
    },
    {
      id: 'copy-path',
      label: 'Copy path',
      icon: 'copy',
      submenu,
      disabled: options.disabled,
    },
  ];
}
