import type { SystemIcon } from '@shared/icon';
import type { PropertyValues } from '@core/properties/collectionProperties';

/**
 * An entry's collection property values: raw, never display-formatted, filled once by the
 * domain adapter (`toCollectionEntry` for notes and folders). A key is absent when the entry
 * has no such value. The Name is always present.
 *
 * This is the ONLY place an entry carries a collection property — Name, Description, Cover
 * image, Created, Last edited, Archived. Sorting reads these values, and each layout formats
 * what it shows from them; nothing else on the entry duplicates one.
 */
export type CollectionEntryValues = PropertyValues & { readonly name: string };

/**
 * A folder or note as the collection views draw it, in three separate groups:
 *
 *  1. `values` — the collection property values (above);
 *  2. identity and interaction — what the entry is, its icon, and what clicking it does;
 *  3. domain / layout payload — facts that belong to one kind of entry or one layout and are
 *     NOT collection properties: a note's Markdown body (the Card canvas), a folder's counts,
 *     and the cover's focal point.
 */
export interface CollectionEntryModel {
  readonly id: string;
  readonly type: 'folder' | 'note';
  readonly icon: SystemIcon;
  readonly emoji: string | null;
  readonly selected: boolean;
  readonly onClick: () => void;

  /** The collection property values — see `CollectionEntryValues`. */
  readonly values: CollectionEntryValues;

  /**
   * The note's Markdown body (EffectivePage.markdown — body-only, no frontmatter, and the live
   * editing-session text when the note is open) for the Card view's read-only NotePageCanvas.
   * Only ever set for a `note` entry. Consumers other than Card mode never read it.
   */
  readonly markdown?: string;
  /**
   * The cover's focal point (`PageMetadata.coverPositionAbove`) for the Card canvas, which
   * always draws a cover at the top. The cover itself is the `cover` VALUE (absent when the
   * note's cover is hidden), resolved to a loadable URL by the Card's injected resolver.
   */
  readonly coverPositionAbove?: number;
  /** Only ever set for a `folder` entry, from the same membership queries its own page uses: the folder card's metadata line. */
  readonly subfolderCount?: number;
  readonly noteCount?: number;
}
