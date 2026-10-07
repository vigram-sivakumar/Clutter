import { findTagOccurrences } from '../tag/findTagOccurrences';

export interface ScannedTagOccurrence {
  // Exactly as typed in Markdown — never rewritten or case-normalized.
  // normalizeTagName() exists for comparison (dedup, metadata lookup,
  // autocomplete matching), not for deciding what gets stored.
  readonly name: string;
  // The `#name` span's exact character range within the original document
  // (the same `content` string passed to `extract()`). `startOffset` is
  // the `#` character's own index; `endOffset` is exclusive. This is what
  // lets a consumer (Tag collection → "Show in note", rename) resolve an
  // occurrence to its position without re-deriving it from `name`.
  readonly startOffset: number;
  readonly endOffset: number;
}

/**
 * Tag extraction is the shared tag grammar applied to a parse tree
 * (`tag/findTagOccurrences.ts`) — the same grammar the editor's `Tag` node
 * uses — not a second scanner. This class only adapts the result to the
 * analysis shape.
 */
export class TagExtractor {
  extract(content: string): readonly ScannedTagOccurrence[] {
    return findTagOccurrences(content);
  }
}
