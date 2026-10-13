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
  | 'old-path-reoccupied'
  /** The renamed heading has no spelling a `#fragment` can carry (empty, `^…`, or one of `\\ | ] #`). */
  | 'unsupported-heading';

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

/** The one heading whose text changed between two saves: its index in the ATX-heading list, and its old and new text. */
export interface HeadingRename {
  readonly index: number;
  readonly from: string;
  readonly to: string;
}

/**
 * Infers a heading rename from the heading texts of a baseline and of the newly saved note — or `null`
 * when it cannot be inferred unambiguously. A heading has no identity but its text and its place in the
 * list, so a rename is exactly: the same number of headings, and ONE heading whose text differs. An
 * insertion, a deletion, a reorder, several simultaneous changes, or a level-only change (same text)
 * is not a rename, and a deleted heading's references are never redirected.
 *
 * References resolve to the FIRST heading with their text, so the renamed heading must have been the
 * first with its old text (renaming a later duplicate cannot have moved a reference), and the new text
 * must not already belong to an earlier heading (the rewritten references would resolve there instead).
 */
export function detectHeadingRename(baseline: readonly string[], current: readonly string[]): HeadingRename | null {
  if (baseline.length !== current.length) {
    return null;
  }

  let index = -1;

  for (let i = 0; i < baseline.length; i++) {
    if (baseline[i] !== current[i]) {
      if (index !== -1) {
        return null;
      }

      index = i;
    }
  }

  if (index === -1) {
    return null;
  }

  const from = baseline[index]!;
  const to = current[index]!;

  if (from.startsWith('^') || baseline.indexOf(from) !== index || current.indexOf(to) < index) {
    return null;
  }

  return { index, from, to };
}

/** Whether `heading` can be the text after `#` in `[[Note#heading]]` and be read back as that heading (not a block reference). */
export function isRepresentableHeadingFragment(heading: string): boolean {
  return isRepresentableLinkTarget(heading) && !heading.startsWith('^');
}

/**
 * Points every link and embed that names the heading `from` — in a note `targetsPage` says is the edited one —
 * at `to`. Only the heading text is replaced: the note part, a `|alias`, the whitespace around the fragment and
 * everything outside the reference are kept byte for byte. A `#^block` reference is never a heading, and code
 * is skipped (both by the shared extractors). Returns `markdown` itself when nothing matched.
 */
export function rewriteHeadingReferences(
  markdown: string,
  from: string,
  to: string,
  targetsPage: (target: string) => boolean
): string {
  const spans = findReferenceSpans(markdown).sort((a, b) => b.start - a.start);
  let next = markdown;

  for (const span of spans) {
    const text = next.slice(span.start, span.end);
    const hash = text.indexOf('#', span.openerLength);
    const pipe = text.indexOf('|', span.openerLength);
    const fragmentEnd = pipe === -1 ? text.length - 2 : pipe;

    // A `#` inside the alias is the alias's, not a heading's.
    if (hash === -1 || hash >= fragmentEnd || !targetsPage(span.target)) {
      continue;
    }

    const raw = text.slice(hash + 1, fragmentEnd);

    if (raw.trim() !== from) {
      continue;
    }

    const start = span.start + hash + 1 + (raw.length - raw.trimStart().length);
    next = next.slice(0, start) + to + next.slice(start + from.length);
  }

  return next;
}

/** Whether `markdown` has a link or embed whose `#fragment` is the heading `from`, in a note `targetsPage` accepts. */
export function referencesHeading(markdown: string, from: string, targetsPage: (target: string) => boolean): boolean {
  return rewriteHeadingReferences(markdown, from, '\u0000', targetsPage) !== markdown;
}
