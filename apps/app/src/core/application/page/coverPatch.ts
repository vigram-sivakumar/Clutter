/**
 * The metadata patch for giving a page a new cover image: the new reference,
 * un-hidden (a collection shows a hidden cover as none), and re-centered —
 * a framing position belongs to the image it was set against, so it never
 * carries over to a replacement. Shared by every "set this note's cover"
 * entry point so the rule lives once.
 */
export function newCoverPatch(cover: string) {
  return {
    cover,
    coverHidden: false,
    coverPositionAbove: 50,
    coverPositionSide: 50,
  };
}
