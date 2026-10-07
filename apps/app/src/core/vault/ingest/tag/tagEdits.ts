import { normalizeTagName } from '../../models/Tag';
import { findTagOccurrences } from './findTagOccurrences';

/**
 * Semantic tag edits: every edit is located by the shared grammar's parse
 * tree (`findTagOccurrences`), never by a text search or a regex over the
 * document — so code, escapes, URLs, headings and unrelated text that merely
 * contains `#name` are never touched, and an edit can only ever change a
 * span the editor itself would render as that tag.
 *
 * Pure: strings in, strings out. Callers (TagOperations) re-run these on the
 * *current* content right before each write, which is what revalidates a
 * plan against whatever changed since it was made.
 */

export interface TagEditResult {
  readonly markdown: string;
  /** How many tag occurrences were changed. */
  readonly count: number;
}

/** Rewrites every tag for which `matches(name)` holds to `#newName` (name without `#`). */
export function renameTagInMarkdown(
  markdown: string,
  matches: (name: string) => boolean,
  newName: string
): TagEditResult {
  const targets = findTagOccurrences(markdown).filter((span) => matches(span.name));
  let result = markdown;

  // Back to front so earlier offsets stay valid.
  for (const span of [...targets].reverse()) {
    result = `${result.slice(0, span.startOffset)}#${newName}${result.slice(span.endOffset)}`;
  }

  return { markdown: result, count: targets.length };
}

/**
 * Removes every tag for which `matches(name)` holds, along with exactly one
 * adjoining space/tab so the surrounding prose closes up (`a #t b` → `a b`,
 * `#t b` → `b`, `a #t` → `a`). The rest of the line, including any line the
 * tag was alone on, is left as it is.
 */
export function removeTagFromMarkdown(
  markdown: string,
  matches: (name: string) => boolean
): TagEditResult {
  const targets = findTagOccurrences(markdown).filter((span) => matches(span.name));
  let result = markdown;

  for (const span of [...targets].reverse()) {
    let from = span.startOffset;
    let to = span.endOffset;

    if (from > 0 && isHorizontalSpace(result[from - 1])) {
      from -= 1;
    } else if (isHorizontalSpace(result[to])) {
      to += 1;
    }

    result = `${result.slice(0, from)}${result.slice(to)}`;
  }

  return { markdown: result, count: targets.length };
}

/**
 * Frontmatter `tags` counterpart of renameTagInMarkdown: every entry for
 * which `matches` holds becomes `newName`, and the note ends up listing the
 * new tag once — an entry that already is the new tag (a merge, or a
 * resumed rename) or repeats an earlier renamed one is dropped. Returns null
 * when nothing matched.
 */
export function renameTagInList(
  tags: readonly string[],
  matches: (name: string) => boolean,
  newName: string
): string[] | null {
  if (!tags.some(matches)) {
    return null;
  }

  const newKey = normalizeTagName(newName);
  const out: string[] = [];
  let placed = false;

  for (const tag of tags) {
    if (matches(tag) || normalizeTagName(tag) === newKey) {
      if (!placed) {
        out.push(newName);
        placed = true;
      }
    } else {
      out.push(tag);
    }
  }

  return out;
}

/** Frontmatter `tags` counterpart of removeTagFromMarkdown. Returns null when nothing matched. */
export function removeTagFromList(
  tags: readonly string[],
  matches: (name: string) => boolean
): string[] | null {
  return tags.some(matches) ? tags.filter((tag) => !matches(tag)) : null;
}

function isHorizontalSpace(char: string | undefined): boolean {
  return char === ' ' || char === '\t';
}

/**
 * Re-spells every tag whose `restyle(name)` differs from how it is typed —
 * the "restyle existing tags" counterpart of renameTagInMarkdown. Located by
 * the parse tree like every other edit here; an occurrence already in the
 * target style is left byte-identical, so a second run changes nothing.
 */
export function restyleTagsInMarkdown(
  markdown: string,
  restyle: (name: string) => string
): TagEditResult {
  const targets = findTagOccurrences(markdown).filter((span) => restyle(span.name) !== span.name);
  let result = markdown;

  for (const span of [...targets].reverse()) {
    result = `${result.slice(0, span.startOffset)}#${restyle(span.name)}${result.slice(span.endOffset)}`;
  }

  return { markdown: result, count: targets.length };
}

/**
 * Frontmatter `tags` counterpart of restyleTagsInMarkdown: every entry is
 * re-spelled, and entries that become the same logical tag (`Foo` and `foo`
 * both listed) collapse to the first. Returns null when nothing changed.
 */
export function restyleTagList(
  tags: readonly string[],
  restyle: (name: string) => string
): string[] | null {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const tag of tags) {
    const key = normalizeTagName(tag);

    if (key && seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(restyle(tag));
  }

  return out.length === tags.length && out.every((tag, index) => tag === tags[index]) ? null : out;
}
