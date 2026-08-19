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

import { isTokenEngaged } from '../semanticToken/tokenEngagement';
import { referenceZoneAt } from './wikiLinkCompletionSource';
import { isWikiLinkNode, type WikiLinkNodeRange } from './wikiLinkEngagement';
import { lastUnescapedSlashOffset } from './wikiLinkScanner';

/** Length of the `[[`/`]]` bracket pair — scanWikiLink guarantees both are present and exactly two characters (wikiLinkScanner.ts). */
const BRACKET_LENGTH = 2;

/**
 * Same `tok-mark` class the heading markers use (highlight/markdownHighlightStyle.ts),
 * plus a WikiLink-specific class so the compound selector in MarkdownEditor.css
 * can scope the `var(--marker-foreground)` color to WikiLink brackets only —
 * mirroring the `.tok-headingN.tok-mark` pattern rather than styling bare
 * `.tok-mark`.
 */
const bracketMark = Decoration.mark({ class: 'tok-mark tok-wikilink-mark' });

/**
 * Hides the folder-prefix portion of an engaged WikiLink's reference —
 * `Decoration.replace({})`, no widget, same primitive `liveMarkDecoration.ts`
 * already uses to hide ordinary formatting markers, just applied to a
 * WikiLink-specific sub-range instead of a marker. Deliberately **not**
 * registered in `EditorView.atomicRanges`: that would make Backspace/Delete
 * remove the entire hidden prefix in one keystroke, which this editor can't
 * safely offer since it has no undo. Cursor motion across this range is
 * instead handled by `wikiLinkKeymap.ts`'s own `hopOverConcealedLeft`/
 * `Right` commands — a custom keymap, not native atomicity — so navigation
 * stays predictable without any destructive deletion side effect.
 */
const concealedFolder = Decoration.replace({});

/**
 * At rest, a WikiLink's `[[`/`]]` never render at all — the whole node,
 * brackets included, is replaced wholesale by a `WikiLinkWidget`
 * (wikiLinkDecorations.ts). Once engaged, the raw `[[path|alias]]` text
 * becomes visible — except the folder-prefix portion of the path, which
 * stays concealed (`concealedFolder` above): the canonical full path
 * remains in the buffer and resolves normally, but the editing UI never
 * exposes it, only the filename (and alias, if any) — the same
 * canonical-path/editing-representation split
 * `docs/editor-architecture-decisions.md` records. Brackets are marked
 * for coloring as before; the path/alias text between them is otherwise
 * left completely undecorated, keeping its normal text color.
 */
function buildMarkerDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (!isWikiLinkNode(node.name)) {
          return;
        }

        const range: WikiLinkNodeRange = { from: node.from, to: node.to };
        if (!isTokenEngaged(view.state, range)) {
          return;
        }

        builder.add(range.from, range.from + BRACKET_LENGTH, bracketMark);

        const zone = referenceZoneAt(view.state, range.from + BRACKET_LENGTH);
        if (zone) {
          const refText = view.state.sliceDoc(zone.from, zone.to);
          const slashOffset = lastUnescapedSlashOffset(refText);
          if (slashOffset !== null) {
            builder.add(zone.from, zone.from + slashOffset + 1, concealedFolder);
          }
        }

        builder.add(range.to - BRACKET_LENGTH, range.to, bracketMark);
      },
    });
  }

  return builder.finish();
}

interface WikiLinkMarkerPlugin extends PluginValue {
  decorations: DecorationSet;
}

/**
 * Purely visual: marks the two bracket ranges of an engaged WikiLink with
 * `tok-mark`/`tok-wikilink-mark` so MarkdownEditor.css can color them via
 * `var(--marker-foreground)`, the same global marker-styling rule headings
 * use. Adds no atomic ranges, no interaction handling, and never touches
 * document text — a plain `Decoration.mark` layer alongside
 * `wikiLinkDecorations`'s at-rest widget replacement, not a replacement
 * for it.
 */
export function wikiLinkMarkerDecorations(): Extension {
  return ViewPlugin.fromClass<WikiLinkMarkerPlugin>(
    class implements WikiLinkMarkerPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildMarkerDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildMarkerDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
