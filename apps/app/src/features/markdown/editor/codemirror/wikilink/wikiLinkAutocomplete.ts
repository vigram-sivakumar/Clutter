import {
  CompletionContext,
  closeCompletion,
  completionStatus,
  selectedCompletion,
  startCompletion,
} from '@codemirror/autocomplete';
import { Prec } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

import { findWikiLinkAt } from './wikiLinkEngagement';
import type { WikiLinkCompletion } from './wikiLinkCompletionRenderer';
import { WIKILINK_TRIGGER_PATTERN, referenceZoneAt } from './wikiLinkCompletionSource';

/**
 * Re-skins CM6's own `.cm-tooltip-autocomplete` popup to match
 * FolderPicker's container (`folder-picker` in FolderPicker.css) —
 * `EditorView.theme()`, not a plain stylesheet: CM6 injects its
 * `autocompletion()` baseTheme dynamically at extension-creation time,
 * after any statically-bundled CSS, so a plain external rule targeting
 * these same selectors would lose the cascade regardless of specificity
 * (the exact issue `editorTheme.ts` already documents and works around
 * for `.cm-activeLine`; the same fix applies here).
 *
 * Exported — despite the name, every rule inside targets generic CM6
 * classes (`.cm-tooltip-autocomplete`, `.cm-completionLabel`, etc.), never
 * anything WikiLink-specific, so `codemirror/completion.ts` reuses it
 * wholesale as the one shared completion-popup theme for every `@`/`[[`
 * source rather than duplicating it.
 */
export function wikiLinkAutocompleteTheme(): Extension {
  return EditorView.theme({
    '.cm-tooltip.cm-tooltip-autocomplete': {
      background: 'var(--surface-secondary)',
      border: 'none',
      borderRadius: 'var(--radius-xxl)',
      // No padding here — `<ul>` below is CM6's own scroll container
      // (`overflow-y: auto` from its baseTheme), and padding on this outer
      // box would inset that scrollbar away from the popup's true right
      // edge. This element stays the visual surface only (background,
      // border, radius, shadow); breathing room moves to `<ul>` (block +
      // inline-start only) and to `.wikilink-completion`'s own inline-end
      // padding below, so content spacing is unchanged while the scroll
      // track itself reaches the popup's real edge.
      // CM6 anchors the tooltip's own left edge exactly at the completion
      // range's start position (the `[[` trigger) and its top edge
      // directly against the text line, with no built-in gap — this is
      // the one place to add breathing room on either axis.
      marginTop: 'var(--space-6)',
      boxShadow: 'var(--shadow-inset-default), var(--shadow-md)',
    },
    // CM6's own baseTheme rule for this element (`.cm-tooltip.cm-tooltip-
    // autocomplete > ul { maxHeight: '10em', ... }`) has higher raw CSS
    // specificity (two chained classes + child combinator) than a plain
    // `.cm-tooltip-autocomplete ul` selector (one class + descendant
    // combinator) would — so it silently wins regardless of EditorView.theme()
    // vs baseTheme() precedence, capping the popup at ~130px instead of the
    // 260px below. Matching its exact selector shape here is what makes our
    // value actually apply (verified via computed style: without this, `ul`'s
    // computed max-height stayed 10em/130px despite this rule saying 260px).
    '.cm-tooltip.cm-tooltip-autocomplete > ul': {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-12)',
      maxHeight: '260px',
      // Now that the outer tooltip carries no padding, `<ul>` — CM6's own
      // scroll container — sits flush with the popup's edges, and this
      // padding reproduces the old breathing room on all four sides
      // (verified empirically: a scrollbar renders flush against its
      // scroll container's own edge regardless of that container's own
      // padding — an overlay scrollbar draws over the vacated padding
      // area rather than being pushed inward by it, measured via a live
      // test div; a classic/non-overlay scrollbar sits adjacent to the
      // border for the same reason, per the standard CSS box model. So
      // `padding-inline-end` here restores the row content/background's
      // right-side gap before the scrollbar without re-insetting the
      // scrollbar itself away from the popup's true edge — confirming
      // `padding-inline-start`-only was an over-correction). Matches the
      // outer box's own radius so the (already CM6-owned) overflow-y:auto
      // clipping follows the popup's rounded corners instead of squaring
      // them off now that `<ul>` reaches all the way to the edges.
      paddingBlock: 'var(--space-8)',
      paddingInline: 'var(--space-8)',
      borderRadius: 'var(--radius-xxl)',
    },
    '.cm-tooltip-autocomplete ul > li': {
      padding: '0',
      minHeight: 'var(--height-lg)',
      gap: 'var(--space-12)',

      // Without this, flexbox's default flex-shrink:1 compresses every row
      // to fit inside `ul`'s max-height *before* `ul`'s own overflow-y:auto
      // (CM6 baseTheme) ever kicks in — squeezing two-line rows below their
      // natural content height and clipping the breadcrumb (each squeezed
      // `<li>` becomes its own scroll container, since CM6 baseTheme's
      // `overflow-x: hidden` on `<li>` computes `overflow-y` to `auto` per
      // the CSS Overflow spec). Verified via computed style: rows with a
      // breadcrumb measured scrollHeight 46px but clientHeight only 34px
      // without this. `flex-shrink: 0` keeps every row at its natural (or
      // min-height-floored) size, so overflow is handled by the list
      // scrolling instead of individual rows compressing.
      flexShrink: '0',
      borderRadius: 'var(--radius-lg)',
    },
    // Hover moves CM6's actual selection (see renderWikiLinkCompletion's
    // `mouseenter` listener) rather than adding a second, CSS-only
    // highlight — so `[aria-selected]` alone is the single visual driver,
    // the same single-source-of-truth invariant FolderPicker keeps via its
    // one `activeId` state (FolderPicker.tsx / useMenuKeyboard.ts).
    '.cm-tooltip-autocomplete ul > li[aria-selected]': {
      background: 'var(--entry-selected-surface)',
      color: 'var(--entry-selected-foreground)',
    },
    // CM6's own default option content (the plain-text label span) has no
    // per-completion `render` override in this installed version — only
    // `addToOptions`, which adds alongside it rather than replacing it.
    // `renderWikiLinkCompletion` already shows this same text (plus the
    // icon/breadcrumb it doesn't), so the default label is hidden rather
    // than shown twice.
    '.cm-tooltip-autocomplete .cm-completionLabel': {
      display: 'none',
    },
  });
}

/**
 * The `|` key, while a WikiLink reference completion is active: commits
 * the currently-selected suggestion as the reference (replacing the
 * in-progress `[[query` text with its `path`, a literal `|`, and the
 * closing `]]`) and closes completion — the reference/display-name
 * boundary the whole feature is built around. The closing brackets are
 * inserted immediately, not left for the user to type: `wikiLinkMarkerDecorations.ts`'s
 * folder-prefix concealment only applies to an already-closed `WikiLink`
 * syntax node (per the grammar's own "no partial node" rule — an unclosed
 * `[[path|` has no such node at all, since Lezer never produces one for
 * invalid/incomplete syntax), so leaving it open here would visually
 * expose the full canonical path for as long as the alias remained
 * unfinished. Closing immediately keeps this path consistent with the
 * other acceptance route (Enter/click), which already inserts the full
 * `[[path]]` atomically via `serializeWikiLink`. Not a second,
 * Clutter-owned selection: `selectedCompletion(state)` reads whichever
 * `Completion` CM6 itself currently has highlighted (arrow keys/mouse
 * hover, entirely CM6's own machinery, untouched here), so this only ever
 * acts on CM6's own selection state.
 *
 * Scoped to a fresh, not-yet-closed WikiLink only (`findWikiLinkAt`
 * returning non-null means the cursor is inside an *already-closed*
 * `[[reference|alias]]`, which already has its own pipe and closing
 * brackets further along — typing `|` there falls through to ordinary
 * text insertion instead of this special handling, rather than risk
 * producing a second, redundant pipe).
 *
 * Recovers the exact in-progress range via the same
 * `WIKILINK_TRIGGER_PATTERN` `wikiLinkCompletionSource` itself matches
 * against (through a fresh `CompletionContext`, the same public
 * constructor completion sources are built from) rather than a second,
 * differently-derived notion of "the current query range".
 */
export function acceptReferenceForDisplayName(view: EditorView): boolean {
  const pos = view.state.selection.main.head;
  if (findWikiLinkAt(view.state, pos)) {
    return false;
  }

  const completion = selectedCompletion(
    view.state
  ) as Partial<WikiLinkCompletion> | null;
  if (!completion?.suggestion) {
    return false;
  }

  const match = new CompletionContext(view.state, pos, false).matchBefore(
    WIKILINK_TRIGGER_PATTERN
  );
  if (!match) {
    return false;
  }

  const { suggestion } = completion;
  const insertText = `${suggestion.path}|]]`;
  const cursorPos = match.from + 2 + suggestion.path.length + 1;

  view.dispatch({
    changes: { from: match.from + 2, to: pos, insert: insertText },
    selection: { anchor: cursorPos },
  });
  closeCompletion(view);

  if (suggestion.kind === 'create') {
    suggestion.create();
  }

  return true;
}

/**
 * CM6's own `activateOnTyping` (the default heuristic `autocompletion()`
 * uses to decide whether a transaction should query sources at all) only
 * covers insertions (`getUpdateType`'s `Activate` bit is set for
 * `input.type`, never for `delete.backward`/`delete.forward`) — by
 * design, since for most completion use-cases backspacing shouldn't pop a
 * fresh completion open. That default is wrong specifically for editing
 * an existing WikiLink's reference: deleting into `News` to get `New`
 * must reactivate completion exactly as typing into it would (per the
 * feature's own spec — "editing the reference" makes no typing-vs-
 * deleting distinction). This listener is the small, targeted exception:
 * only for a doc-changing, deletion-classified transaction that leaves
 * the cursor inside a WikiLink's reference zone (`referenceZoneAt` — the
 * exact same zone definition `wikiLinkCompletionSource` itself uses, not
 * a second one), it calls the public `startCompletion` command — the same
 * command any "trigger completion" keybinding would call — rather than
 * reaching into CM6's completion state directly.
 */
const reactivateOnReferenceDeletion = EditorView.updateListener.of((update) => {
  if (!update.docChanged || completionStatus(update.state) !== null) {
    return;
  }

  const isDeletion = update.transactions.some((tr) => tr.isUserEvent('delete'));
  if (!isDeletion) {
    return;
  }

  if (referenceZoneAt(update.state, update.state.selection.main.head)) {
    startCompletion(update.view);
  }
});

/**
 * WikiLink's own non-`autocompletion()` completion extras: the `|` keymap
 * command (the reference/display-name boundary) and the reactivate-on-
 * deletion listener above. `@codemirror/autocomplete`'s own
 * `autocompletion()` call itself — triggering, popup lifecycle,
 * caret-relative positioning, keyboard navigation, dismissal, which
 * `CompletionSource`s are active, and the shared popup theme
 * (`wikiLinkAutocompleteTheme()`, exported above) — now lives in
 * `codemirror/completion.ts`, the one shared call every `@`/`[[` source
 * must register through (`@codemirror/autocomplete`'s own
 * `completionConfig` facet throws a config-merge conflict if `override`
 * is set by two independent `autocompletion()` calls in the same editor —
 * confirmed by reading its `combineConfig` merge logic directly, not
 * assumed). WikiLink's own completion behavior — trigger pattern,
 * candidate source, popup rendering — is completely unchanged by this
 * move; only where the `autocompletion()` call and its theme are
 * registered from changed.
 */
export function wikiLinkAutocomplete(): Extension {
  return [
    // Highest precedence so this wins over any other binding for `|`
    // (there isn't one today, but this must not depend on staying that
    // way) — when it declines (returns false), the key falls through to
    // ordinary character insertion exactly as if this extension didn't
    // exist.
    Prec.highest(keymap.of([{ key: '|', run: acceptReferenceForDisplayName }])),
    reactivateOnReferenceDeletion,
  ];
}
