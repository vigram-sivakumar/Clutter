import { syntaxTree } from '@codemirror/language';
import { EditorSelection, Prec, type Extension, type StateCommand } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

/**
 * `@codemirror/lang-markdown`'s own `insertNewlineContinueMarkup`/
 * `deleteMarkupBackward` (registered `Prec.high` inside `markdown()`'s
 * default keymap) are hardcoded to `ListItem.parent.name ==
 * "OrderedList"`/`"BulletList"` and to `[-+*]`/digit regexes — confirmed
 * directly against `node_modules/@codemirror/lang-markdown/dist/index.js`.
 * An `EmojiList`-owned `ListItem` matches neither branch, so those
 * commands silently no-op for it; there is no existing seam to extend.
 * This module fills that one gap, narrowly, following the same
 * `Prec.high` + no-op-outside-context shape `listIndentKeymap.ts` already
 * establishes for Tab/Shift-Tab.
 */

function findEmojiListMark(root: SyntaxNode | null): SyntaxNode | null {
  for (let node = root; node; node = node.parent) {
    if (node.name === 'ListItem') {
      const marker = node.firstChild;
      return marker && marker.name === 'EmojiListMark' ? marker : null;
    }
  }
  return null;
}

/**
 * Enter inside an `EmojiList` item repeats the current item's own emoji
 * verbatim on the new line — the same repetition behavior `-`/`*`/`+`
 * already have, and the simpler of the two options since the user already
 * expects to hand-edit the marker when consecutive items use different
 * emoji. An empty item (marker with no content after it) instead exits
 * the list, mirroring native lists' "delete a level of markup" behavior:
 * the marker is stripped from the current line rather than a new line
 * being started.
 */
export const insertNewlineInEmojiList: StateCommand = ({ state, dispatch }) => {
  const tree = syntaxTree(state);
  let handled = false;
  const changes = state.changeByRange((range) => {
    if (!range.empty) {
      return { range };
    }

    const marker = findEmojiListMark(tree.resolveInner(range.from, -1));
    if (!marker) {
      return { range };
    }

    const separatorEnd = state.sliceDoc(marker.to, marker.to + 1) === ' ' ? marker.to + 1 : marker.to;
    if (range.from < separatorEnd) {
      return { range };
    }

    handled = true;
    const line = state.doc.lineAt(range.from);
    const isEmptyItem = !/\S/.test(line.text.slice(separatorEnd - line.from));
    if (isEmptyItem) {
      return { range: EditorSelection.cursor(line.from), changes: { from: line.from, to: line.to, insert: '' } };
    }

    const indent = line.text.slice(0, marker.from - line.from);
    const markerText = state.sliceDoc(marker.from, marker.to);
    const insert = `${state.lineBreak}${indent}${markerText} `;
    return { range: EditorSelection.cursor(range.from + insert.length), changes: { from: range.from, insert } };
  });

  if (!handled) {
    return false;
  }
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

/**
 * Backspace immediately after an `EmojiList` marker's separator space
 * deletes the marker (and its separator), exiting the list on this line —
 * mirroring native lists' first-invocation "delete a level of markup"
 * backspace behavior.
 */
export const deleteEmojiListMarkerBackward: StateCommand = ({ state, dispatch }) => {
  const tree = syntaxTree(state);
  let handled = false;
  const changes = state.changeByRange((range) => {
    if (!range.empty) {
      return { range };
    }

    const marker = findEmojiListMark(tree.resolveInner(range.from, -1));
    if (!marker) {
      return { range };
    }

    const separatorEnd = state.sliceDoc(marker.to, marker.to + 1) === ' ' ? marker.to + 1 : marker.to;
    if (range.from !== separatorEnd) {
      return { range };
    }

    handled = true;
    return {
      range: EditorSelection.cursor(marker.from),
      changes: { from: marker.from, to: separatorEnd, insert: '' },
    };
  });

  if (!handled) {
    return false;
  }
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'delete' }));
  return true;
};

export function emojiListKeymap(): Extension {
  return Prec.high(
    keymap.of([
      { key: 'Enter', run: insertNewlineInEmojiList },
      { key: 'Backspace', run: deleteEmojiListMarkerBackward },
    ])
  );
}
