import {
  EditorState,
  Prec,
  type ChangeSpec,
  type Extension,
  type StateCommand,
} from '@codemirror/state';
import { keymap } from '@codemirror/view';

import { computeIndentChange, resolveLineIndentContext } from './markdownIndentContext';

/**
 * Markdown-aware Tab/Shift-Tab — the editor-indentation half of the
 * milestone (blockquote-deepening Tab, table cell navigation, and
 * heading-level Tab are explicitly separate, not-yet-designed later
 * milestones; nothing here touches them).
 *
 * Operates on real **document** lines only (`state.doc.lineAt`), never
 * visual/wrapped rows — a paragraph that soft-wraps across several
 * visual rows is still exactly one document line here, and gets exactly
 * one indentation change, applied once at its own real start
 * (`line.from`), regardless of which wrapped row the caret happens to be
 * on. This falls out of using `state.doc`/`syntaxTree(state)` throughout
 * and never any view/DOM/coordinate API — the same reason this file
 * introduces no new caret-coordinate machinery at all.
 *
 * Per-line, resolved independently (`resolveLineIndentContext`) — a
 * multi-line selection touching a mix of supported (`paragraph`/`list`)
 * and unsupported (`heading`/`code`/`blockquote`/anything else) lines
 * applies the new rule only to the supported ones and leaves every other
 * touched line completely untouched in that same keypress (no fallback
 * generic indent is layered in for the unsupported lines within a mixed
 * selection — deliberately out of scope for this milestone, not silently
 * guessed at).
 *
 * `code` lines are recognized (`resolveLineIndentContext` returns
 * `{kind: 'code'}`) but deliberately produce no change here at all —
 * "ordinary code indentation is appropriate" (the design's own words)
 * means *today's already-existing* generic Tab/Shift-Tab handling is
 * already correct for them, so this command declines them exactly like
 * `heading`/`unhandled`, letting them fall through unchanged rather than
 * reimplementing logic that doesn't need to change.
 */

interface LineOutcome {
  readonly handled: boolean;
  readonly change: ChangeSpec | null;
}

function lineOutcome(state: EditorState, from: number, direction: 1 | -1): LineOutcome {
  const line = state.doc.lineAt(from);
  const context = resolveLineIndentContext(state, line);

  if (context.kind !== 'paragraph' && context.kind !== 'list') {
    return { handled: false, change: null };
  }

  return { handled: true, change: computeIndentChange(line, context, direction) };
}

/**
 * Shared implementation for both directions. Walks every physical line
 * touched by every selection range (deduplicated, so an empty/collapsed
 * range and a range spanning several lines are both handled by the same
 * loop), collecting one `ChangeSpec` per line that has one.
 *
 * Returns `false` (declines — falls through to whatever handles Tab
 * today) only when **no** touched line resolved to `paragraph`/`list` at
 * all. When at least one line did resolve to a supported kind, this
 * always returns `true` and swallows the keypress — including when every
 * such line was already at its direction's limit (Shift-Tab's 0-space
 * floor; Tab has no limit) and produced zero actual changes. That's what
 * makes the 0-space floor a real floor: without this, declining at the
 * limit would let the keypress fall through to the generic
 * `indentMore`/`indentLess` beneath it.
 */
function markdownIndentDirection(direction: 1 | -1): StateCommand {
  return ({ state, dispatch }) => {
    const seenLines = new Set<number>();
    const changes: ChangeSpec[] = [];
    let anyHandled = false;

    for (const range of state.selection.ranges) {
      let pos = range.from;
      while (pos <= range.to) {
        const line = state.doc.lineAt(pos);
        if (!seenLines.has(line.from)) {
          seenLines.add(line.from);
          const outcome = lineOutcome(state, line.from, direction);
          if (outcome.handled) {
            anyHandled = true;
            if (outcome.change) {
              changes.push(outcome.change);
            }
          }
        }
        pos = line.to + 1;
      }
    }

    if (!anyHandled) {
      return false;
    }

    if (changes.length) {
      dispatch(
        state.update({
          changes,
          userEvent: direction === 1 ? 'input.indent' : 'delete.dedent',
        })
      );
    }

    return true;
  };
}

export const markdownIndentMore: StateCommand = markdownIndentDirection(1);
export const markdownIndentLess: StateCommand = markdownIndentDirection(-1);

/**
 * `Prec.high`, same precedence `markdownEnterKeymap()` already uses, for
 * the identical reason: it must win over `createEditorView.ts`'s own
 * `indentWithTab` (registered in that file's lowest-priority keymap,
 * added last) without that shared, non-Markdown-specific file needing
 * any change at all — this shadows it for Markdown editing only, exactly
 * the existing Enter/Backspace pattern.
 */
export function markdownIndentKeymap(): Extension {
  return Prec.high(
    keymap.of([
      { key: 'Tab', run: markdownIndentMore },
      { key: 'Shift-Tab', run: markdownIndentLess },
    ])
  );
}
