/**
 * Hand-copied inline SVGs shared by every raw-CM6-DOM embed widget's
 * floating action row (`PdfEmbedWidget.ts`, `NoteEmbedWidget.ts`) — no
 * React tree is available inside a CM6 `WidgetType`, so the app's real
 * `AppIcon` component system can't mount here, the same reason
 * `invalidEmbedCard.ts`'s own `EDIT_ICON` is hand-copied rather than
 * imported from `iconRegistry.ts`. Extracted here once both `PdfEmbedWidget`
 * and `NoteEmbedWidget` needed the same two glyphs, rather than a second
 * hand-copy living in each file.
 */

/** Same glyph `iconRegistry.ts` registers as `expandDiagonal` — a pair of diagonal arrows pointing away from each other, matching the app's own "open in a bigger surface"/navigate-away affordance. */
export const EXPAND_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.3887 12.417C2.92818 11.9565 3.00477 10 3.00477 10M3.3887 12.417C3.84922 12.8775 5.80563 12.8009 5.80563 12.8009M3.3887 12.417L7 9" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.4169 3.38871C11.9564 2.92819 9.99999 3.00478 9.99999 3.00478M12.4169 3.38871C12.8774 3.84923 12.8008 5.80564 12.8008 5.80564M12.4169 3.38871L9 7" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Same glyph `iconRegistry.ts` registers as `moreHorizontal` — for a "More actions" control. */
export const MORE_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="3.5" cy="8" r="1.25" fill="currentColor"/><circle cx="8" cy="8" r="1.25" fill="currentColor"/><circle cx="12.5" cy="8" r="1.25" fill="currentColor"/></svg>';
