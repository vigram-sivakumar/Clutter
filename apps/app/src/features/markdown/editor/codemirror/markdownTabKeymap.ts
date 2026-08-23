import type { Extension, StateCommand } from '@codemirror/state';
import { keymap } from '@codemirror/view';

import { dedentListItem, indentListItem } from './list/listIndentKeymap';
import { dedentParagraph, indentParagraph } from './paragraph/paragraphIndentKeymap';

/**
 * Tab/Shift-Tab context routing — the one shared piece between list and
 * paragraph indentation, and deliberately nothing more than this: each
 * `run` below simply tries the structural (list) command first, falling
 * through to the text (paragraph) command only when list ownership was
 * explicitly ruled out (`indentListItem`/`dedentListItem` return `false`
 * only when no touched line has an owning `ListItem` at all — never as a
 * "tried and failed" signal, since both always return `true` once they
 * do own the selection, per their own doc comments). This mirrors CM6's
 * own idiom for chaining `StateCommand`s (the same `||`-of-commands shape
 * `@codemirror/commands`' own keymaps use) — not a new dispatch
 * mechanism, registry, or generic indentation framework.
 *
 * Every other context (heading, horizontal rule, blockquote, table,
 * fenced/indented code, or the empty top level) is simply never claimed
 * by either command, so both return `false` and this binding itself
 * yields — CM6 then tries the rest of its keymap chain, and since nothing
 * else binds Tab (confirmed: `defaultKeymap` doesn't, and no other
 * extension in this editor does either), the key falls through to the
 * browser's native behavior exactly as it does today for every construct
 * this milestone doesn't own. Tab is never globally trapped.
 */
/** Exported for direct testing of the routing decision, independent of a real keydown event. */
export const routeTabIndent: StateCommand = (target) => indentListItem(target) || indentParagraph(target);
export const routeShiftTabDedent: StateCommand = (target) => dedentListItem(target) || dedentParagraph(target);

export function markdownTabKeymap(): Extension {
  return keymap.of([
    { key: 'Tab', run: routeTabIndent },
    { key: 'Shift-Tab', run: routeShiftTabDedent },
  ]);
}
