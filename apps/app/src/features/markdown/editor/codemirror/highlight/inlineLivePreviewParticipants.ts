import type { EditorState, Range } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';

/**
 * Declaration of which Markdown constructs participate in inline Live
 * Preview visibility, and how each one renders **when it is not
 * revealed** — per the Inline Live Preview Region ODR
 * (docs/editor-research/inline-live-preview-region-odr-v1.md).
 *
 * ODR §4.5: a participant's renderer owns decoration and visual
 * representation **only**. It never computes, consults, or overrides
 * engagement — by the time a renderer is called, the single authoritative
 * mechanism (`inlineLivePreviewRegion.ts`) has already decided this
 * occurrence renders as preview. A renderer that asked about engagement
 * itself would reintroduce exactly the per-construct decision the ODR
 * exists to eliminate.
 *
 * ODR §4.8: adding a participant is one entry in the map below plus its
 * own renderer. It must never require modifying another participant's
 * entry, renderer, tests, or behavior. That property is the primary
 * acceptance test for this architecture — if a future construct can't be
 * added that way, the design has regressed.
 *
 * ODR §4.7: nothing here may name a *combination* of constructs. Each
 * entry describes one construct in isolation; how two of them compose is
 * decided structurally by the syntax tree, never declared here.
 *
 * Phase 1 scope (ODR §10) is deliberately the three currently-wired
 * participants only. `Highlight`, `InlineCode` (Phase 2) and the
 * semantic-token/widget family — `WikiLink`, `Tag`, `Date`, `Task`
 * (Phase 3) — are **not** registered yet, and must not be added here
 * without doing the rest of their phase's work.
 */
export type ParticipantRenderer = (
  node: SyntaxNodeRef,
  state: EditorState
) => readonly Range<Decoration>[];

/**
 * Renderer for a construct whose source form is `<mark>content<mark>` —
 * exactly two same-named delimiter children with the styled content
 * between them. Conceals both delimiter runs and classes the content.
 *
 * This factory takes **one** construct's own facts (its delimiter node
 * name, its content class); it encodes no relationship between
 * constructs. It exists because the three Phase 1 participants genuinely
 * share this one shape, not as a general assumption that every future
 * participant will — a widget-replaced construct (Phase 3) will register
 * a completely different `ParticipantRenderer` without touching this.
 *
 * Logic migrated unchanged from the retired `emphasisLivePreview.ts` /
 * `strikethroughLivePreview.ts`, which each inlined this same shape.
 * `firstChild`/`lastChild` reliably resolve the two delimiter runs for
 * all three node kinds (each always parses with exactly two mark children
 * and nothing else of its own); the name check is a guard against a stale
 * tree, in which case nothing is decorated this pass and the next reparse
 * corrects it.
 */
function delimitedInlineRenderer(
  markNodeName: string,
  contentClass: string
): ParticipantRenderer {
  return (node) => {
    const openMark = node.node.firstChild;
    const closeMark = node.node.lastChild;
    if (
      !openMark ||
      openMark.name !== markNodeName ||
      !closeMark ||
      closeMark.name !== markNodeName
    ) {
      return [];
    }

    const ranges: Range<Decoration>[] = [
      Decoration.replace({}).range(openMark.from, openMark.to),
    ];
    // An empty construct (`****`) has its two marks adjacent, with no
    // content range between them to class.
    if (openMark.to < closeMark.from) {
      ranges.push(
        Decoration.mark({ class: contentClass }).range(openMark.to, closeMark.from)
      );
    }
    ranges.push(Decoration.replace({}).range(closeMark.from, closeMark.to));
    return ranges;
  };
}

/**
 * The participant set. Membership in this map is what makes a node kind
 * visibility-participating; `inlineLivePreviewRegion.ts` reads it and
 * knows nothing else about any construct.
 */
export const inlineLivePreviewParticipants: ReadonlyMap<string, ParticipantRenderer> =
  new Map<string, ParticipantRenderer>([
    ['Emphasis', delimitedInlineRenderer('EmphasisMark', 'tok-emphasis')],
    ['StrongEmphasis', delimitedInlineRenderer('EmphasisMark', 'tok-strong')],
    ['Strikethrough', delimitedInlineRenderer('StrikethroughMark', 'tok-strike')],
  ]);
