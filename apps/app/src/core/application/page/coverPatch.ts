import type { CoverCredit } from '../../vault/models';

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
