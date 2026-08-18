import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
  type WidgetType,
} from '@codemirror/view';

import { isTokenEngaged, type TokenNodePredicate, type TokenNodeRange } from './tokenEngagement';

/**
 * Produces the at-rest widget for one token occurrence, or `null` to skip
 * decorating it this pass (e.g. a stale-tree scan failure — the next
 * reparse corrects it). `raw` is the node's own already-matched source
 * text, re-sliced from the buffer rather than carried on the syntax tree
 * (disposable, always re-derivable, per the architecture's "no data beyond
 * node type and range on the tree" rule).
 */
export type RenderToken = (
  view: EditorView,
  node: TokenNodeRange,
  raw: string
) => WidgetType | null;

function buildDecorations(
  view: EditorView,
  isTokenNode: TokenNodePredicate,
  renderToken: RenderToken
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (!isTokenNode(node.name)) {
          return;
        }

        const range: TokenNodeRange = { from: node.from, to: node.to };

        // No decoration for an engaged node — the raw Markdown renders as
        // ordinary editable text. See tokenEngagement.ts for the shared
        // containment rule, also used by the mouse/keyboard mechanism.
        if (isTokenEngaged(view.state, range)) {
          return;
        }

        const raw = view.state.sliceDoc(node.from, node.to);
        const widget = renderToken(view, range, raw);
        if (!widget) {
          return;
        }

        builder.add(node.from, node.to, Decoration.replace({ widget }));
      },
    });
  }

  return builder.finish();
}

interface TokenDecorationPlugin extends PluginValue {
  decorations: DecorationSet;
}

/**
 * Generic reveal-on-engagement rendering + atomic-range wiring, shared by
 * every semantic inline construct kind (docs/editor-architecture-decisions.md
 * §11). `isTokenNode` names which Lezer node types participate;
 * `renderToken` supplies the kind's own at-rest widget. Marks at-rest
 * ranges atomic for cursor movement and deletion
 * (`EditorView.atomicRanges`, reusing the same decoration set — an at-rest
 * range is exactly what should be atomic, never an ordinary hidden
 * Live-Preview mark, per the validated distinction in
 * docs/editor-architecture-decisions.md).
 *
 * Interaction handling (click, Alt/Option-click, keyboard entry and
 * activation) is deliberately not here — see tokenMouseHandlers.ts and
 * tokenKeymap.ts.
 */
export function semanticTokenDecorations(
  isTokenNode: TokenNodePredicate,
  renderToken: RenderToken
): Extension {
  const plugin = ViewPlugin.fromClass<TokenDecorationPlugin>(
    class implements TokenDecorationPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, isTokenNode, renderToken);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view, isTokenNode, renderToken);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );

  const atomic = EditorView.atomicRanges.of(
    (view) => view.plugin(plugin)?.decorations ?? Decoration.none
  );

  return [plugin, atomic];
}
