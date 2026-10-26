import type { SystemIcon } from '@shared/icon';

/**
 * The injected WikiLink autocomplete contract — mirrors
 * `wikiLinkResolution.ts`'s `ResolveWikiLink` shape and the same boundary
 * rule (docs/editor-architecture-decisions.md, "Editor/persistence
 * boundary"): the editor never imports `Vault`/`PageOperations`/
 * `FolderOperations` itself, it only calls a function the app layer
 * supplies.
 *
 * Kinds, not a generic one: a `page`, `folder` or `asset` suggestion just needs
 * inserting; a `create` suggestion needs the same insert *plus* a
 * fire-and-forget side effect. `create` bundles its own behavior
 * (`create: () => void`) the same way `WikiLinkResolution` bundles
 * `activate: () => void` for an unresolved reference's click — the editor
 * never decides what "create" does, only that it must call it.
 */
export interface WikiLinkPageSuggestion {
  readonly kind: 'page';
  /** Vault-relative, no extension — exactly the shape `serializeWikiLink`/`ResolveWikiLink` already use. */
  readonly path: string;
  readonly title: string;
  /** The page's parent path for display (e.g. "Projects / Work"), or null for a root-level page. */
  readonly breadcrumb: string | null;
  /**
   * The page's alias the query matched, when it was found by an alias
   * rather than its title (absent then). Accepting inserts it as the
   * link's display text — `[[path|alias]]` — never as the target.
   */
  readonly alias?: string;
  /** True for a Daily Note: the popup lists it under Daily notes by its short date title, with no path. */
  readonly dailyNote?: boolean;
  /** The page's own emoji, shown in place of the note icon. */
  readonly emoji?: string | null;
}

/**
 * A folder, listed under Folders. Its `path` is the vault-relative folder path with a trailing slash
 * (`Projects/`) — the spelling that names a folder rather than a note of the same name.
 */
export interface WikiLinkFolderSuggestion {
  readonly kind: 'folder';
  readonly path: string;
  readonly title: string;
  /** The folder's parent path for display, or null for a top-level folder. */
  readonly breadcrumb: string | null;
  /** The folder's icon by registry name — a reserved folder's own (Inbox, Templates, …); absent for an ordinary folder. */
  readonly icon?: SystemIcon;
  /** The folder's own emoji, shown in place of the icon; absent for a reserved folder. */
  readonly emoji?: string;
}

/**
 * An asset file, listed under Images or PDFs. Its `path` is the vault-relative path with the file's
 * real extension (`Assets/hero.png`), exactly as an embed of it is written.
 */
export interface WikiLinkAssetSuggestion {
  readonly kind: 'asset';
  readonly path: string;
  /** The file's name without its extension. */
  readonly title: string;
  readonly breadcrumb: string | null;
  readonly assetKind: 'image' | 'pdf';
  /** A loadable URL for the file, for the row's thumbnail (an image's picture, a PDF's first page) — as `![[` shows. */
  readonly previewUrl?: string;
}

export interface WikiLinkCreateSuggestion {
  readonly kind: 'create';
  /** The literal path as typed — becomes both the inserted WikiLink target and the created page's path. */
  readonly path: string;
  readonly create: () => void;
}

export type WikiLinkSuggestion =
  | WikiLinkPageSuggestion
  | WikiLinkFolderSuggestion
  | WikiLinkAssetSuggestion
  | WikiLinkCreateSuggestion;

/** `query` is the raw text typed after `[[`, never including the brackets themselves. */
export type GetWikiLinkSuggestions = (query: string) => readonly WikiLinkSuggestion[];
