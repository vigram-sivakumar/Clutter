import { ensureSyntaxTree } from '@codemirror/language';
import type { EditorState, StateEffect } from '@codemirror/state';
import { DEFAULT_IMAGE_UI_STATE, setImageUiState } from '../image/imageUiState';
import { selectInsertedEmbeds, type EmbedObjectRange } from './embedObjectSelection';

/** One insertion policy for autocomplete and imported files. Only actual parsed embeds qualify;
 * literal syntax in code or other non-embed contexts must not acquire an invisible selection.
 * The state and ranges are post-change; the returned effects belong in the original transaction.
 */
export function insertedEmbedEffects(
  state: EditorState,
  from: number,
  to: number,
  matches: (raw: string) => boolean = () => true
): StateEffect<unknown>[] {
  const ranges: EmbedObjectRange[] = [];
  ensureSyntaxTree(state, to, 100)?.iterate({
    from, to,
    enter(node) {
      if (node.name === 'Embed' && node.from >= from && node.to <= to && matches(state.sliceDoc(node.from, node.to))) {
        ranges.push({ from: node.from, to: node.to });
        return false;
      }
    },
  });
  if (!ranges.length) return [];
  return [
    ...ranges.map((range) => setImageUiState.of({ pos: range.from, to: range.to, state: DEFAULT_IMAGE_UI_STATE })),
    selectInsertedEmbeds(ranges),
  ];
}
