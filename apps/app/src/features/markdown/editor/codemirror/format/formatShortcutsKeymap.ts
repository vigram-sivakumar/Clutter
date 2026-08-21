import { EditorSelection } from '@codemirror/state';
import type { Extension, StateCommand } from '@codemirror/state';
import { keymap } from '@codemirror/view';

/**
 * Cmd/Ctrl-B/-I/-E — wraps the selection in the corresponding Markdown
 * marker pair (`**`/`*`/`` ` ``), or unwraps it if the selection is already
 * exactly flanked by that marker (toggle, matching Obsidian's own
 * behavior). With an empty selection, inserts an empty marker pair and
 * places the cursor between them, ready to type.
 *
 * Deliberately just a text transform: the resulting Markdown is picked up
 * by the existing `emphasisMarkerDecoration`/`inlineCodeMarkerDecoration`
 * Live Preview decorations exactly like manually-typed `**bold**` would be
 * — no new rendering path, no awareness of engagement/decoration state
 * needed here.
 */
export function toggleWrap(marker: string): StateCommand {
  return ({ state, dispatch }) => {
    const changes = state.changeByRange((range) => {
      const { from, to } = range;

      if (from !== to) {
        const before = state.sliceDoc(Math.max(0, from - marker.length), from);
        const after = state.sliceDoc(to, Math.min(state.doc.length, to + marker.length));
        if (before === marker && after === marker) {
          return {
            changes: [
              { from: from - marker.length, to: from },
              { from: to, to: to + marker.length },
            ],
            range: EditorSelection.range(from - marker.length, to - marker.length),
          };
        }
      }

      return {
        changes: [
          { from, insert: marker },
          { from: to, insert: marker },
        ],
        range:
          from === to
            ? EditorSelection.cursor(from + marker.length)
            : EditorSelection.range(from + marker.length, to + marker.length),
      };
    });

    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.format' }));
    return true;
  };
}

export function formatShortcutsKeymap(): Extension {
  return keymap.of([
    { key: 'Mod-b', run: toggleWrap('**') },
    { key: 'Mod-i', run: toggleWrap('*') },
    { key: 'Mod-e', run: toggleWrap('`') },
  ]);
}
