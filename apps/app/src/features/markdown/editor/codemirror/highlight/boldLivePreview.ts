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

/**
 * Bold-only Live Preview vertical slice (docs/editor-architecture-decisions.md's
 * "Live-preview rendering architecture" section — Recommended, not locked;
 * this is the first, deliberately narrow proof of it).
 *
 * Deliberately does not reuse `liveMarkDecoration.ts`/`emphasisMarkerDecoration.ts`:
 * `liveMarkDecoration` unconditionally wires in `liveMarkSelectionSnap`, which
 * uses `EditorState.transactionFilter.of(...)` — out of scope per this slice's
 * explicit constraint against transactionFilter/changeFilter for rendering.
 * `isTokenEngaged` (`semanticToken/tokenEngagement.ts`) is reused as-is: it's a
 * pure selection-containment query with no side effect and no coupling to the
 * removed keymap/selection-snap machinery.
 *
 * `StrongEmphasis` always parses with exactly two `EmphasisMark` children (the
 * opening/closing `**` or `__` run) and nothing else of its own — inline text
 * between them isn't itself a node — so `firstChild`/`lastChild` reliably
 * identify the delimiters (same shape `emphasisMarkerDecoration.ts` relies on).
 */
function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'StrongEmphasis') {
          return;
        }

        const openMark = node.node.firstChild;
        const closeMark = node.node.lastChild;
        if (!openMark || openMark.name !== 'EmphasisMark' || !closeMark || closeMark.name !== 'EmphasisMark') {
          return;
        }

        if (isTokenEngaged(view.state, { from: node.from, to: node.to })) {
          return;
        }

        builder.add(openMark.from, openMark.to, Decoration.replace({}));
        if (openMark.to < closeMark.from) {
          builder.add(openMark.to, closeMark.from, Decoration.mark({ class: 'tok-strong' }));
        }
        builder.add(closeMark.from, closeMark.to, Decoration.replace({}));
      },
    });
  }

  return builder.finish();
}

interface BoldLivePreviewPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function boldLivePreview(): Extension {
  return ViewPlugin.fromClass<BoldLivePreviewPlugin>(
    class implements BoldLivePreviewPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
