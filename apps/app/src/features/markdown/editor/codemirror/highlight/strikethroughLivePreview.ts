import { syntaxTree } from '@codemirror/language';
import type { Extension, Range } from '@codemirror/state';
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
 * GFM Strikethrough (`~~text~~`) Live Preview — a separate plugin from
 * `emphasisLivePreview.ts`, per the dedicated Strikethrough investigation
 * (docs/editor-architecture-decisions.md). Unlike `Emphasis`/
 * `StrongEmphasis`, `Strikethrough` is a single node type that cannot
 * self-nest: 3+ leading tildes at the start of a line parse as a
 * `FencedCode` block instead (confirmed via direct parser inspection), and
 * a mid-line 4+/6+-tilde run still produces exactly one `Strikethrough`
 * node with the leftover tildes absorbed as literal content, never a
 * nested `Strikethrough`. There is therefore no same-kind-chain case to
 * coordinate here the way the emphasis family's traversal short-circuit
 * exists for — this plugin only needs to handle `Strikethrough` composing
 * with `Emphasis`/`StrongEmphasis`, which nests with zero character gap
 * exactly like every other confirmed composition in this codebase
 * (WikiLink-in-StrongEmphasis, Emphasis-in-StrongEmphasis), so ordinary
 * node-range containment via `isTokenEngaged` is sufficient on its own —
 * no traversal short-circuit is needed, since a caret inside a nested
 * Emphasis/StrongEmphasis is, by the same containment fact, already
 * inside the enclosing Strikethrough's own range.
 *
 * `Strikethrough` always parses with exactly two `StrikethroughMark`
 * children (the opening/closing `~~` delimiter run) and nothing else of
 * its own — `firstChild`/`lastChild` reliably identify them.
 *
 * Ranges are collected into an array and sorted once via `Decoration.set(_,
 * true)` rather than inserted in tree-visitation order via
 * `RangeSetBuilder`, for the same reason `emphasisLivePreview.ts` does:
 * a nested construct's outer content range can be pushed before an inner
 * node's own, earlier-positioned marker ranges (e.g. `~~**bold**~~`'s
 * outer content range starts before `**`'s own marks), which
 * `RangeSetBuilder.add`'s strictly-non-decreasing-`from` requirement
 * can't tolerate but `Decoration.set(ranges, true)` handles correctly.
 *
 * Engagement is checked against the node's own full range (`node.from` to
 * `node.to`), inclusive of both boundaries — the same rule
 * `emphasisLivePreview.ts` uses and for the same reason: a caret sitting
 * exactly at `node.from`/`node.to` is where the caret lands immediately
 * after typing the opening/closing delimiter, so a narrower rule would
 * conceal a just-completed construct on the very keystroke that finished
 * it. This carries the same known, deliberately deferred whole-document-
 * mount limitation `emphasisLivePreview.ts` has (see this file's own test
 * suite) — not solved here, for the same reason it isn't solved there.
 *
 * Deliberately built as its own `ViewPlugin`, not routed through
 * `liveMarkDecoration.ts` (the mechanism `strikethroughMarkerDecoration.ts`
 * still uses) — that shared mechanism unconditionally wires in
 * `liveMarkSelectionSnap.ts`, an `EditorState.transactionFilter`, which is
 * exactly the category of mechanism `emphasisLivePreview.ts` was built to
 * avoid reintroducing for its own family. Whether that transactionFilter
 * is safe to reintroduce is a separate, still-open architectural question
 * this plugin does not resolve.
 */
function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'Strikethrough') {
          return;
        }

        const openMark = node.node.firstChild;
        const closeMark = node.node.lastChild;
        if (!openMark || openMark.name !== 'StrikethroughMark' || !closeMark || closeMark.name !== 'StrikethroughMark') {
          return;
        }

        if (isTokenEngaged(view.state, { from: node.from, to: node.to })) {
          return;
        }

        ranges.push(Decoration.replace({}).range(openMark.from, openMark.to));
        if (openMark.to < closeMark.from) {
          ranges.push(Decoration.mark({ class: 'tok-strike' }).range(openMark.to, closeMark.from));
        }
        ranges.push(Decoration.replace({}).range(closeMark.from, closeMark.to));
      },
    });
  }

  return Decoration.set(ranges, true);
}

interface StrikethroughLivePreviewPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function strikethroughLivePreview(): Extension {
  return ViewPlugin.fromClass<StrikethroughLivePreviewPlugin>(
    class implements StrikethroughLivePreviewPlugin {
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
