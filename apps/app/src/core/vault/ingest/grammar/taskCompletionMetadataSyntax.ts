import type { InlineContext, MarkdownConfig } from '@lezer/markdown';

import {
  isValidTaskCompletionMetadataPrecedingContext,
  scanTaskCompletionMetadata,
} from './taskCompletionMetadataScanner';

const AT = '@'.charCodeAt(0);

/**
 * The `TaskCompletionMetadata` Lezer node — registered through the same
 * public `MarkdownConfig` mechanism `dateSyntax.ts`/`tagSyntax.ts`/
 * `wikiLinkSyntax.ts` use. Gives the visual-rendering layer
 * (`taskCompletionMetadataDecoration.ts`) a real, source-backed tree node
 * to conceal, rather than a second, ungrounded regex scan over rendered
 * text — "use the actual parser structure, not hard-coded string
 * hiding," per the explicit product requirement this construct exists
 * for.
 *
 * No `before`/`after` ordering needed against `dateSyntax.ts`'s own
 * `Date` parser: both trigger on `next === AT`, but their shapes are
 * mutually exclusive by construction — `Date` requires a digit
 * immediately after `@` (`scanDate`), this requires the literal
 * `completed:` — so at most one can ever claim a given `@`, in any
 * registration order.
 *
 * Context-free by construction, exactly like `dateSyntax.ts`'s own
 * `Date` node: this parser never inspects whether it's inside a `Task`'s
 * own content to decide whether `@completed:2026-08-31` is a
 * `TaskCompletionMetadata` node — it always is, wherever it appears.
 * Task-specific *meaning* is assembled entirely downstream
 * (`core/vault/ingest/extractors/TaskExtractor.ts`, a different layer, a
 * different parser); this grammar only recognizes the shape.
 */
export const taskCompletionMetadataSyntax: MarkdownConfig = {
  defineNodes: ['TaskCompletionMetadata'],
  parseInline: [
    {
      name: 'TaskCompletionMetadata',
      parse(cx: InlineContext, next: number, pos: number): number {
        if (next !== AT) {
          return -1;
        }

        // Mirrors dateSyntax.ts's/tagSyntax.ts's own reasoning exactly:
        // cx.slice cannot see before this inline context's own `offset`.
        const before = pos > cx.offset ? cx.slice(pos - 1, pos) : undefined;
        if (!isValidTaskCompletionMetadataPrecedingContext(before)) {
          return -1;
        }

        const match = scanTaskCompletionMetadata(cx.slice(pos, cx.end), 0);
        if (!match) {
          return -1;
        }

        return cx.addElement(cx.elt('TaskCompletionMetadata', pos, pos + match.end));
      },
    },
  ],
};
