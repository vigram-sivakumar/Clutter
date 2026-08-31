import { syntaxTree } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';

/**
 * Conceals a `TaskCompletionMetadata` node (`@completed:<date>`,
 * `taskCompletionMetadataSyntax.ts`) permanently — never revealed, in
 * either engaged or at-rest state. Explicit product requirement: "the
 * metadata must remain in the underlying Markdown/document... visually
 * hidden as metadata... do not make it unexpectedly appear simply
 * because the caret moves nearby."
 *
 * **Deliberately not routed through `liveMarkDecoration.ts`'s shared
 * hide-on-rest mechanism** (used for heading/blockquote/emphasis
 * markers): that mechanism's entire contract is reveal-on-engage — the
 * concealed range becomes plain, visible, editable text the moment the
 * selection enters it, so the user can edit the markup. Completion
 * metadata has no such "edit the raw syntax" use case (nothing edits
 * `@completed:2026-08-31` by hand in place) and the product requirement
 * explicitly forbids a reveal state for this construct. Modeled instead
 * on `wikiLinkLivePreview.ts`'s own precedent for the *same* kind of
 * requirement — WikiLink's folder-qualified path "must never be visible,
 * in either state" — including that file's own resolved precedent of
 * *not* registering the concealed range in `EditorView.atomicRanges`:
 * that file's doc comment explicitly accepts "one keystroke per hidden
 * character with no visible caret movement" while crossing a
 * permanently-hidden run, rather than adding atomicity, and this
 * construct has the identical shape (permanently hidden, never edited in
 * place) — so it follows the same choice, not `taskCheckboxDecoration.ts`'s
 * different choice (atomic), which exists there specifically because the
 * checkbox *is* a discrete, click-toggleable, whole-unit control.
 *
 * `Decoration.replace({})` — zero-width, no widget, no DOM text node —
 * the same concealment primitive `liveMarkDecoration.ts`/
 * `wikiLinkLivePreview.ts` already use, for the same documented reason
 * (a `display:none` text node still participates in native hit-testing;
 * a real `Decoration.replace` with nothing rendered does not).
 */
function buildDecorations(view: EditorView): DecorationSet {
  const pending: { from: number; to: number }[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'TaskCompletionMetadata') {
          return;
        }
        if (node.to > view.state.doc.lineAt(node.from).to) {
          // The scanner never emits a node crossing a physical line break
          // (a date shape has no newline in it), but this guards the CM6
          // invariant directly, mirroring wikiLinkLivePreview.ts's own
          // identical belt-and-suspenders check.
          return;
        }
        pending.push({ from: node.from, to: node.to });
      },
    });
  }

  return Decoration.set(
    pending.map(({ from, to }) => Decoration.replace({}).range(from, to)),
    true
  );
}

interface TaskCompletionMetadataPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function taskCompletionMetadataDecoration(): Extension {
  return ViewPlugin.fromClass<TaskCompletionMetadataPlugin>(
    class implements TaskCompletionMetadataPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    { decorations: (p) => p.decorations }
  );
}
