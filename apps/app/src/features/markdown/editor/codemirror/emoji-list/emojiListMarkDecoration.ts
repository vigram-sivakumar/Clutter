import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';

/**
 * `cm-emoji-list-marker` — a purely visual class for styling the emoji
 * itself (e.g. font-size/line-height tweaks), always applied, never
 * hidden. Unlike `-`/`*`/`1.` (see `listMarkerDecoration.ts`), the emoji
 * marker is never replaced by a widget: the raw character already is the
 * glyph the user wants to see, so this only wraps it in a class, the same
 * `Decoration.mark`-only pattern `wikiLinkMarkerDecorations.ts` uses for
 * `[[`/`]]` coloring — no atomic ranges, no text replacement.
 *
 * Also carries `cm-list-marker` — the shared class every list-item marker
 * kind carries (bullet/ordered/task/emoji alike); see `ListBulletWidget`'s
 * doc comment for the full rationale.
 */
const emojiMark = Decoration.mark({ class: 'cm-list-marker cm-emoji-list-marker' });

function buildEmojiListMarkDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'EmojiListMark') {
          return;
        }
        builder.add(node.from, node.to, emojiMark);
      },
    });
  }

  return builder.finish();
}

interface EmojiListMarkPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function emojiListMarkDecoration(): Extension {
  return ViewPlugin.fromClass<EmojiListMarkPlugin>(
    class implements EmojiListMarkPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildEmojiListMarkDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildEmojiListMarkDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
