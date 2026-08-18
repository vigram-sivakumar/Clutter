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
import { isWikiLinkNode, type WikiLinkNodeRange } from './wikiLinkEngagement';

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
 * At rest, a WikiLink's `[[`/`]]` never render at all — the whole node,
 * brackets included, is replaced wholesale by a `WikiLinkWidget`
 * (wikiLinkDecorations.ts). Only once engaged does the raw `[[path|alias]]`
 * text become visible, as plain unstyled text (see WikiLinkWidget.ts's
 * "no visual styling" note) — so this only ever needs to run for engaged
 * nodes, marking the two bracket ranges and nothing else. The path/alias
 * text between them is left completely undecorated, keeping its normal
 * text color.
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
