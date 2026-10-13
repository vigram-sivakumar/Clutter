import { EmbedExtractor } from '../../vault/ingest/extractors/EmbedExtractor';
import { LinkExtractor } from '../../vault/ingest/extractors/LinkExtractor';
import { VaultPath } from '../../vault/ingest/VaultPath';

const linkExtractor = new LinkExtractor();
const embedExtractor = new EmbedExtractor();

/** Why a source note's references to a renamed note were left as they were. */
export type ReferenceRewriteSkipReason =
  /** The file on disk no longer matches what the Vault last read — never overwritten. */
  | 'changed-on-disk'
  /** The new name has no spelling the wiki-link grammar and its index can both read. */
  | 'unsupported-title'
  /** Another note now sits at the old path, so the old text may mean that note instead. */
  | 'old-path-reoccupied';

/** What rewriting the references to one renamed note did. */
export interface ReferenceRewriteSummary {
  readonly rewrittenPageIds: readonly string[];
  readonly skipped: readonly { readonly pageId: string; readonly path: string; readonly reason: ReferenceRewriteSkipReason }[];
  readonly failed: readonly { readonly pageId: string; readonly path: string; readonly message: string }[];
  /** True when every source that needed a rewrite got one. */
  readonly complete: boolean;
}

export const NO_REFERENCE_REWRITE: ReferenceRewriteSummary = {
  rewrittenPageIds: [],
  skipped: [],
  failed: [],
  complete: true,
};

/** The canonical wiki-link target of a note: vault-relative, no extension (`Projects/Roadmap`). */
export function pageLinkTarget(path: string, root: string): string {
  return VaultPath.withoutExtension(VaultPath.relativeTo(path, root));
}

/**
 * Whether `target` can be written as `[[target]]` / `![[target]]` and still be read back, identically,
 * by both the editor's scanner and the ingest extractors. `\` `|` `]` are the grammar's escape and
 * delimiter characters — the editor can escape them, but the extractors (and so the index and
 * References) cannot read an escape — and `#` / `^` would turn the tail into a heading or block
 * reference. There is no escape for `#`, and none of these is invented here.
 */
export function isRepresentableLinkTarget(target: string): boolean {
  return target.trim().length > 0 && !/[\\|\]#\r\n]/.test(target);
}

interface ReferenceSpan {
  readonly start: number;
  readonly end: number;
  readonly target: string;
  /** Length of the `[[` / `![[` opener inside the span. */
  readonly openerLength: number;
}

/** Every genuine `[[…]]` link and `![[…]]` embed in `markdown` (code is already excluded by the extractors). */
function findReferenceSpans(markdown: string): ReferenceSpan[] {
  return [
    ...linkExtractor.extract(markdown).map((ref) => ({ ...ref, openerLength: 2 })),
    ...embedExtractor.extract(markdown).map((ref) => ({ ...ref, openerLength: 3 })),
  ].map((ref) => ({ start: ref.startOffset, end: ref.endOffset, target: ref.target, openerLength: ref.openerLength }));
}

/** Whether `markdown` holds at least one link or embed whose target is exactly `target`. */
export function referencesTarget(markdown: string, target: string): boolean {
  return findReferenceSpans(markdown).some((span) => span.target === target);
}

/**
 * Points every link and embed whose target is exactly `from` at `to`. Only the target segment of each
 * reference is replaced, so an alias, `#heading`, `^block` and everything outside the reference are kept
 * byte for byte. Returns `markdown` itself when nothing matched.
 */
export function rewriteReferenceTargets(markdown: string, from: string, to: string): string {
  const spans = findReferenceSpans(markdown)
    .filter((span) => span.target === from)
    .sort((a, b) => b.start - a.start);

  let next = markdown;

  for (const span of spans) {
    // Only whitespace can precede the target inside the brackets, so its first occurrence after the opener is it.
    const targetStart = next.indexOf(from, span.start + span.openerLength);

    if (targetStart === -1 || targetStart >= span.end) {
      continue;
    }

    next = next.slice(0, targetStart) + to + next.slice(targetStart + from.length);
  }

  return next;
}
