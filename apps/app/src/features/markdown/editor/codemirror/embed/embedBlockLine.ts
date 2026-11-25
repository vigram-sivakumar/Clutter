import type { EditorState } from '@codemirror/state';

/** A standalone block may carry continuation indentation or quote prefixes, but no surrounding text. */
export function isStandaloneEmbedLine(state: EditorState, embed: { from: number; to: number }): boolean {
  const line = state.doc.lineAt(embed.from);
  return embed.to <= line.to
    && /^(?:[ \t]*>[ \t]?)*[ \t]*$/.test(state.sliceDoc(line.from, embed.from))
    && /^[ \t]*$/.test(state.sliceDoc(embed.to, line.to));
}
