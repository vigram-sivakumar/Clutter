import { syntaxTree } from '@codemirror/language';
import { Prec, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common';

import { isTokenEngaged, type TokenNodeRange } from '../semanticToken/tokenEngagement';
import { renderWikiLink } from './wikiLinkDecorations';
import { lastUnescapedSlashOffset, scanWikiLink, splitAtFirstUnescapedPipe } from './wikiLinkScanner';
import type { ResolveWikiLink } from './wikiLinkResolution';

/**
 * Widens WikiLink's own engagement boundary to include any directly
 * enclosing chain of delimited-inline-formatting ancestors (Emphasis,
 * StrongEmphasis, Strikethrough, Highlight, InlineCode — every construct
 * `delimitedInlineRenderer` in `inlineLivePreviewParticipants.ts` handles),
 * without naming any of them: every one of those, and only those, parses
 * with exactly two identically-named children whose name ends in `Mark`
 * bracketing the content (already asserted generically by
 * `inlineLivePreviewRegion.test.ts`'s "node shape" test) — the same
 * structural fact `delimitedInlineRenderer` itself keys off (`firstChild`/
 * `lastChild` same-name check). Reusing that fact here, rather than a list
 * of node names, is what keeps this generic: it composes with any current
 * or future participant following the same grammar convention with zero
 * new knowledge added about what that participant is.
 *
 * Stops at the first ancestor that doesn't match — ordinary block
 * containers (Paragraph, Document, ListItem, TableCell, ...) never have
 * two identically-`Mark`-named children bracketing their content, so the
 * walk naturally terminates at the paragraph boundary rather than
 * reaching the document root.
 *
 * Without this, `**[[Page]]**` has a real two-character gap on each side
 * (the `**` runs) where StrongEmphasis's own, separately-computed
 * engagement is true but WikiLink's own (narrower) node range isn't yet —
 * producing a `**Page**` state that shouldn't exist. This makes WikiLink's
 * engagement track the *outermost* enclosing region that visually reveals
 * around it, exactly like nested delimited constructs already track each
 * other via `inlineLivePreviewRegion.ts`'s own short-circuit — just
 * computed bottom-up here, since WikiLink sits outside that traversal.
 */
function isDelimitedMarkConstruct(node: SyntaxNode): boolean {
  const first = node.firstChild;
  const last = node.lastChild;
  return !!first && !!last && first !== last && first.name === last.name && first.name.endsWith('Mark');
}

function widenToEnclosingLivePreviewRegion(node: SyntaxNodeRef): TokenNodeRange {
  let widest: TokenNodeRange = { from: node.from, to: node.to };
  let ancestor = node.node.parent;
  while (ancestor && isDelimitedMarkConstruct(ancestor)) {
    widest = { from: ancestor.from, to: ancestor.to };
    ancestor = ancestor.parent;
  }
  return widest;
}

/**
 * WikiLink's own, standalone visibility mechanism — deliberately outside
 * `inlineLivePreviewRegion.ts`. WikiLink no longer implements that shared
 * mechanism's contract ("engaged region reveals raw source"): the required
 * behavior here is that the folder-qualified path must never be visible,
 * in either state, while the rest of the WikiLink syntax (`[[`, filename,
 * `|alias`, `]]`) becomes plain editable text once engaged. That's a
 * genuinely different per-node contract than every other participant in
 * `inlineLivePreviewParticipants.ts` shares — Tag and Date keep the
 * ordinary reveal-on-engage contract unchanged, so they stay there.
 *
 * At rest: identical to the retired participant entry — `renderWikiLink`
 * (unchanged) produces the same at-rest widget, atomic exactly as before.
 *
 * Engaged: `[[`, the filename, `|alias` (if present), and `]]` all render
 * as plain, unstyled, editable text — not atomic, per the explicit
 * requirement that Backspace/Delete work character-by-character rather
 * than risk one keystroke deleting the whole reference. Only the
 * folder-prefix substring (up to and including the last unescaped `/`) is
 * concealed, via a zero-width `Decoration.replace({})` — the same
 * technique the retired `wikiLinkMarkerDecorations.ts` used for the same
 * purpose. `lastUnescapedSlashOffset`/`splitAtFirstUnescapedPipe` are
 * reused unchanged from `wikiLinkScanner.ts` — the same primitives
 * `wikiLinkCompletionSource.ts` already uses to scope its own query to
 * "the visible segment", so there is exactly one definition of where the
 * visible part starts, not two.
 *
 * No Arrow-key handling, no custom keymap, no cursor repositioning: CM6's
 * own default caret motion is left entirely alone. Crossing the hidden
 * folder-prefix costs one keystroke per hidden character with no visible
 * caret movement — the same accepted cost the old mechanism had before its
 * now-removed hop keymap compensated for it (docs/editor-architecture-
 * decisions.md's "CodeMirror owns cursor and selection behavior" locks
 * that keymap out; this file does not attempt to replace it).
 *
 * Reuses `isTokenEngaged` unchanged (imported, never modified) — the exact
 * same containment check every other construct uses, just evaluated from
 * this file's own tree scan instead of the shared traversal's.
 */
function buildEngagedDecorations(node: SyntaxNodeRef, state: EditorState): Range<Decoration>[] {
  const raw = state.sliceDoc(node.from, node.to);
  if (!scanWikiLink(raw, 0)) {
    // Stale tree — next reparse corrects it, same as the at-rest branch.
    return [];
  }

  const middleStart = node.from + 2;
  const middleEnd = node.to - 2;
  const middleRaw = state.sliceDoc(middleStart, middleEnd);
  const { pipeIndex } = splitAtFirstUnescapedPipe(middleRaw);
  const pathRawEnd = pipeIndex === null ? middleEnd : middleStart + pipeIndex;
  const pathRaw = state.sliceDoc(middleStart, pathRawEnd);

  const slashOffset = lastUnescapedSlashOffset(pathRaw);
  if (slashOffset === null) {
    // No folder component — the whole reference is already just the
    // filename, nothing to conceal.
    return [];
  }

  return [Decoration.replace({}).range(middleStart, middleStart + slashOffset + 1)];
}

function buildDecorations(
  view: EditorView,
  getResolver: () => ResolveWikiLink | undefined
): { decorations: DecorationSet; atomic: DecorationSet } {
  const ranges: Range<Decoration>[] = [];
  const atomicRanges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'WikiLink') {
          return;
        }

        if (isTokenEngaged(view.state, widenToEnclosingLivePreviewRegion(node))) {
          ranges.push(...buildEngagedDecorations(node, view.state));
          return;
        }

        const raw = view.state.sliceDoc(node.from, node.to);
        const widget = renderWikiLink(raw, getResolver);
        if (!widget) {
          return;
        }
        const range = Decoration.replace({ widget }).range(node.from, node.to);
        ranges.push(range);
        atomicRanges.push(range);
      },
    });
  }

  return { decorations: Decoration.set(ranges, true), atomic: Decoration.set(atomicRanges, true) };
}

interface WikiLinkLivePreviewPlugin extends PluginValue {
  decorations: DecorationSet;
  atomic: DecorationSet;
}

export function wikiLinkLivePreview(getResolver: () => ResolveWikiLink | undefined): Extension {
  const plugin = ViewPlugin.fromClass<WikiLinkLivePreviewPlugin>(
    class implements WikiLinkLivePreviewPlugin {
      decorations: DecorationSet;
      atomic: DecorationSet;

      constructor(view: EditorView) {
        ({ decorations: this.decorations, atomic: this.atomic } = buildDecorations(view, getResolver));
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          ({ decorations: this.decorations, atomic: this.atomic } = buildDecorations(update.view, getResolver));
        }
      }
    },
    { decorations: (p) => p.decorations }
  );

  const atomic = EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none);

  // Prec.high: keeps this extension self-contained rather than relying on
  // where MarkdownEditor.tsx happens to list it. CM6 nests mark/widget
  // decorations by facet precedence, not by range containment alone (see
  // Decoration.mark's own doc comment in @codemirror/view) — the enclosing
  // StrongEmphasis/Strikethrough/etc. content mark (inlineLivePreviewRegion,
  // default precedence) must not out-rank the WikiLink widget, or it gets
  // split at the widget's boundary instead of wrapping it. Verified by a
  // controlled A/B: swapping only registration order changed a bare
  // `<span class="tok-wikilink">` sibling into the correct
  // `tok-strong > tok-wikilink` nesting.
  return Prec.high([plugin, atomic]);
}
