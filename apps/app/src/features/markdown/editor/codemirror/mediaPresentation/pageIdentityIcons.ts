/**
 * The three "page identity" default icons — hand-copied SVG strings for
 * raw-DOM (non-React) rendering, the single shared source every raw-DOM
 * widget that needs to show a resolved page's own default icon draws
 * from. Mirrors `getPageIcon()`'s own three-way return for a real page
 * (`core/presentation/getPageIcon.ts`: `'note'` for a plain note,
 * `'calendarNote'`/`'calendarDot'` for a daily note, the dot variant only
 * for today's own date) — the exact same three glyphs `iconRegistry.ts`
 * wraps as React components (`note.svg`, `calendar-note.svg`,
 * `calendar-dot.svg`) for every other page-identity render site in the
 * app (sidebar rows, breadcrumbs, etc., via `AppIcon.tsx`).
 *
 * Hand-copied rather than imported for the same reason every other
 * widget-local icon constant in this codebase is (`ImageWidget.ts`'s
 * `IMAGE_ICON`, `PdfEmbedWidget.ts`'s `BROKEN_PDF_ICON`,
 * `mediaPresentation/UnknownEmbedWidget.ts`'s `UNKNOWN_FILE_ICON`): the
 * real icon system (`shared/icon/iconRegistry.ts`) emits React
 * components, which cannot mount inside a CM6 `WidgetType`'s plain DOM.
 * Centralized here (rather than duplicated per consumer, the way the
 * broken/invalid-state icons above are) specifically because this trio is
 * shared verbatim by more than one raw-DOM construct that each render a
 * *resolved page's own identity* — today `NoteEmbedWidget.ts`'s working
 * header and `WikiLinkWidget.ts`'s at-rest form, both showing "this
 * page's emoji, or its type's default icon" per `AppIcon.tsx`'s own
 * emoji-or-default rule — so a third, independently hand-copied set would
 * be genuine duplication, not just a similar-looking icon.
 */

export type PageIdentityIconKind = 'note' | 'calendarNote' | 'calendarDot' | 'template';

const NOTE_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 4C2 2.34315 3.34315 1 5 1H11C12.6569 1 14 2.34315 14 4V12C14 13.6569 12.6569 15 11 15H5C3.34315 15 2 13.6569 2 12V4Z" stroke="currentColor" stroke-linecap="round"/><path d="M5 8H11M5 11H11" stroke="currentColor" stroke-linecap="round"/><path d="M5 5H9H5" stroke="currentColor" stroke-linecap="round"/></svg>';

const CALENDAR_NOTE_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 2V1M5 2H11M5 2C3.34315 2 2 3.34315 2 5V11C2 12.6569 3.34315 14 5 14H11C12.6569 14 14 12.6569 14 11V5C14 3.34315 12.6569 2 11 2M11 2V1" stroke="currentColor" stroke-linecap="round"/><path d="M5 5H9M5 8H11M5 11H11" stroke="currentColor" stroke-linecap="round"/></svg>';

const CALENDAR_DOT_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 2V1M11 2V1M4.75 4.5H11.25M5 2H11C12.6569 2 14 3.34315 14 5V11C14 12.6569 12.6569 14 11 14H5C3.34315 14 2 12.6569 2 11V5C2 3.34315 3.34315 2 5 2Z" stroke="currentColor" stroke-linecap="round"/><circle cx="8" cy="9" r="2.25" fill="currentColor"/></svg>';

/** A note in the reserved Templates folder — the same glyph as `template.svg` (`iconRegistry.ts`'s `template`). */
const TEMPLATE_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><g transform="translate(2.4 2.3)"><path d="M2.5 1.28247H1.5C0.947715 1.28247 0.5 1.73019 0.5 2.28247V10.2825C0.5 10.8348 0.947715 11.2825 1.5 11.2825H2.5C3.05228 11.2825 3.5 10.8348 3.5 10.2825V3.28247V2.28247C3.5 1.73019 3.05228 1.28247 2.5 1.28247Z" stroke="currentColor" stroke-linecap="round"/><path d="M5.5 1.28247H4.5C3.94772 1.28247 3.5 1.73019 3.5 2.28247V10.2825C3.5 10.8348 3.94772 11.2825 4.5 11.2825H5.5C6.05228 11.2825 6.5 10.8348 6.5 10.2825V3.28247V2.28247C6.5 1.73019 6.05228 1.28247 5.5 1.28247Z" stroke="currentColor" stroke-linecap="round"/><path d="M8.43185 1.38812L7.46593 1.64694C6.93246 1.78988 6.61588 2.33822 6.75882 2.87169L8.82937 10.5991C8.97231 11.1326 9.52065 11.4491 10.0541 11.3062L11.02 11.0474C11.5535 10.9044 11.8701 10.3561 11.7271 9.82264L9.91542 3.06116L9.6566 2.09523C9.51365 1.56176 8.96532 1.24518 8.43185 1.38812Z" stroke="currentColor" stroke-linecap="round"/></g></svg>';

/** `resolution.icon`'s possible values, mapped to their hand-copied SVG. Mirrors `iconRegistry.ts`'s own name→component lookup, just for the raw-DOM subset of consumers this file serves. */
export const PAGE_IDENTITY_ICON_BY_KIND: Readonly<Record<PageIdentityIconKind, string>> = {
  note: NOTE_ICON,
  calendarNote: CALENDAR_NOTE_ICON,
  calendarDot: CALENDAR_DOT_ICON,
  template: TEMPLATE_ICON,
};
