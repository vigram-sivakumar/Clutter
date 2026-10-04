import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * Skins CM6's `.cm-tooltip-autocomplete` as a `PickerCard`-family surface, for rows built by
 * `buildCompletionRow`. `EditorView.theme()`, not a stylesheet — see `completionRow.css`.
 *
 * Selectors repeat CM6's own baseTheme shapes (`.cm-tooltip.cm-tooltip-autocomplete > ul`) so
 * they win on specificity; CM6's default label element is hidden because every row here renders
 * its own title.
 */
export function completionPopupTheme(): Extension {
  return EditorView.theme({
    '.cm-tooltip.cm-tooltip-autocomplete': {
      background: 'var(--surface-secondary)',
      border: 'none',
      borderRadius: 'var(--radius-xxl)',
      // CM6 puts the popup flush against the text line; this is the gap.
      marginTop: 'var(--space-6)',
      boxShadow: 'var(--shadow-inset-default), var(--shadow-md)',
    },
    // `<ul>` is CM6's scroll container: padding here (not on the outer box) keeps the scrollbar at
    // the popup's real edge.
    '.cm-tooltip.cm-tooltip-autocomplete > ul': {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-1)',
      // The note picker's own width (`PickerCard`: `--dialog-width-md`), fixed so the popup is
      // the same width whatever its rows hold; a long title ellipsizes.
      width: 'var(--dialog-width-md)',
      boxSizing: 'border-box',
      maxHeight: '260px',
      paddingBlock: 'var(--space-8)',
      paddingInline: 'var(--space-8)',
      borderRadius: 'var(--radius-xxl)',
    },
    // While more rows lie below, the last visible ones fade out instead of ending at a hard edge —
    // `PickerCard`'s fade. `completionScrollFade()` sets the attribute.
    '.cm-tooltip.cm-tooltip-autocomplete > ul[data-can-scroll-down]': {
      WebkitMaskImage: 'linear-gradient(to bottom, #000 calc(100% - 40px), transparent)',
      maskImage: 'linear-gradient(to bottom, #000 calc(100% - 40px), transparent)',
    },
    '.cm-tooltip-autocomplete ul > li': {
      padding: '0',
      minHeight: 'var(--height-lg)',
      // Rows keep their natural height; the list scrolls instead of squeezing them.
      flexShrink: '0',
      borderRadius: 'var(--radius-lg)',
    },
    // Section titles are rows CM6 inserts into the same flex column: never shrink them either.
    '.cm-tooltip-autocomplete ul > .completion-section': {
      padding: '0',
      flexShrink: '0',
    },
    // The keyboard-active row looks hovered, as in PickerList (`forceHover`). Hover moves CM6's
    // selection, so `[aria-selected]` is the one driver.
    '.cm-tooltip-autocomplete ul > li[aria-selected]': {
      background: 'var(--entry-hover-surface)',
      color: 'var(--entry-foreground)',
    },
    '.cm-tooltip-autocomplete .cm-completionLabel': {
      display: 'none',
    },
  });
}
