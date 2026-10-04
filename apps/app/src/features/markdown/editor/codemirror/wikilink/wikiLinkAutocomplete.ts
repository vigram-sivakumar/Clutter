import {
  CompletionContext,
  closeCompletion,
  selectedCompletion,
} from '@codemirror/autocomplete';
import { Prec } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

import { completionReactivation } from '../completionLifecycle';
import { findWikiLinkAt } from './wikiLinkEngagement';
import type { WikiLinkCompletion } from './wikiLinkCompletionRow';
import {
  WIKILINK_TRIGGER_PATTERN,
  referenceZoneAt,
} from './wikiLinkCompletionSource';

/**
 * The `|` key, while a WikiLink reference completion is active: commits
 * the currently-selected suggestion as the reference (replacing the
 * in-progress `[[query` text with its `path`, a literal `|`, and the
 * closing `]]`) and closes completion — the reference/display-name
 * boundary the whole feature is built around. The closing brackets are
 * inserted immediately, not left for the user to type: this keeps this
 * acceptance path consistent with the other one (Enter/click), which
 * already inserts the full `[[path]]` atomically via `serializeWikiLink` —
 * accepting a suggestion should always produce a complete, well-formed
 * reference in one step, regardless of which key committed it. Not a second,
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
 * WikiLink's own non-`autocompletion()` completion extras: the `|` keymap
 * command (the reference/display-name boundary) and the shared
 * deletion/empty-entry reactivation lifecycle (`completionLifecycle.ts`),
 * parameterized with WikiLink's own `referenceZoneAt`.
 * `@codemirror/autocomplete`'s own `autocompletion()` call itself —
 * triggering, popup lifecycle, caret-relative positioning, keyboard
 * navigation, dismissal, which `CompletionSource`s are active, and the
 * shared popup theme (`wikiLinkAutocompleteTheme()`, exported above) —
 * lives in `codemirror/completion.ts`, the one shared call every `@`/`[[`
 * source must register through (`@codemirror/autocomplete`'s own
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
    completionReactivation(referenceZoneAt),
  ];
}
