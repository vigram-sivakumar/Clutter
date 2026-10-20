import type { CoverCredit } from '../../vault/models';

/**
 * The cover position a note gets when a cover is added to it, from the app-wide default (Settings → Preferences →
 * Cover image): `{ coverLayout }` to spread into the cover patch, or nothing.
 *
 * Only a cover being *added* to a note that has none takes the default, and only when the note has no saved Top:
 * a note's `coverLayout` is `'side'` (Right) when nothing is saved — the model writes only `'above'` — so a note
 * that is already `'above'` keeps it, and a note that already has a cover (a replacement) keeps whatever position
 * it has. The default `'side'` needs no write: it is what an absent position already is. The default is never
 * written into a note except by this call, so changing the app-wide choice never touches an existing note.
 */
export function initialCoverLayoutPatch(
  current: { readonly cover: string | null; readonly coverLayout: 'side' | 'above' } | undefined,
  defaultLayout: 'side' | 'above'
): { coverLayout?: 'above' } {
  const hasCover = current?.cover != null;
  const hasSavedTop = current?.coverLayout === 'above';

  return !hasCover && !hasSavedTop && defaultLayout === 'above' ? { coverLayout: 'above' } : {};
}

/**
 * The metadata patch for giving a page a new cover image: the new reference,
 * un-hidden (a collection shows a hidden cover as none), and re-centered —
 * a framing position belongs to the image it was set against, so it never
 * carries over to a replacement. Shared by every "set this note's cover"
 * entry point so the rule lives once.
 *
 * `coverCredit` is part of the same patch because the credit describes the
 * image in `cover` (ADR-054): a new cover always replaces it — with the
 * given credit for an Unsplash pick, with null (cleared) for anything else —
 * so a stale photographer can never outlive the photo it credited.
 */
export function newCoverPatch(cover: string, credit: CoverCredit | null = null) {
  return {
    cover,
    coverCredit: credit,
    coverHidden: false,
    coverPositionAbove: 50,
    coverPositionSide: 50,
  };
}
