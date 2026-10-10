import type {
  EditablePageMetadata,
  PageOperations,
} from '@core/application/page/PageOperations';
import { splitKeyBlocks } from '@core/vault/ingest/frontmatter/customFrontmatter';
import type { PageMetadata } from '@core/vault/models/PageMetadata';
import type { PageType } from '@core/vault/models/Page';

import { pickInheritedTemplateMetadata } from './createNoteFromTemplate';

/** What the target note already has — the merge never overwrites any of it. A draft passes what it holds (at most tags). */
export type ExistingNoteMetadata = Partial<
  Pick<
    PageMetadata,
    'icon' | 'cover' | 'description' | 'tags' | 'unownedFrontmatter'
  >
>;

/** `kind` is the template marker's key; a template's kind never describes the note it is applied to. */
const KIND_KEY = 'kind';

/**
 * The template's custom-property blocks whose key the note doesn't have yet (compared ignoring case,
 * the same rule a property name is validated by), minus `kind`. Whole key blocks are copied verbatim, so
 * lists and typed values survive as written.
 */
function missingPropertyLines(
  existingLines: readonly string[],
  templateLines: readonly string[]
): string[] {
  const taken = new Set(
    splitKeyBlocks(existingLines).map((block) => block.key.toLowerCase())
  );
  const added: string[] = [];

  for (const block of splitKeyBlocks(templateLines)) {
    const key = block.key.toLowerCase();

    if (key === KIND_KEY || taken.has(key)) {
      continue;
    }

    taken.add(key);
    added.push(templateLines[block.start]!, ...block.continuation);
  }

  return added;
}

/**
 * What applying a template to an existing note changes, as an updateMetadata() patch — only what the
 * note lacks, so applying the same template twice yields an empty patch the second time:
 *
 *  - tags: the union (the note's own first);
 *  - icon and cover (with its presentation settings): the template's replace the note's — but only when
 *    they differ, so reapplying changes nothing; a daily note never takes the icon;
 *  - description: only when the note has none;
 *  - custom properties: the template's keys the note doesn't already have, appended after its own.
 *
 * Aliases, favorite, id, timestamps and `kind` are never part of it.
 */
export function pickTemplateMetadataToMerge(
  existing: ExistingNoteMetadata,
  template: Parameters<typeof pickInheritedTemplateMetadata>[0],
  noteType: PageType
): Partial<EditablePageMetadata> {
  const inherited = pickInheritedTemplateMetadata(template);
  const patch: {
    -readonly [K in keyof EditablePageMetadata]?: EditablePageMetadata[K];
  } = {};

  if (
    inherited.icon &&
    inherited.icon !== existing.icon &&
    noteType !== 'daily-note'
  ) {
    patch.icon = inherited.icon;
  }

  if (inherited.cover && inherited.cover !== existing.cover) {
    patch.cover = inherited.cover;
    patch.coverHidden = inherited.coverHidden;
    patch.coverLayout = inherited.coverLayout;
    patch.coverPositionAbove = inherited.coverPositionAbove;
    patch.coverPositionSide = inherited.coverPositionSide;
  }

  if (inherited.description && !existing.description) {
    patch.description = inherited.description;
  }

  const existingTags = existing.tags ?? [];
  const newTags = (inherited.tags ?? []).filter(
    (tag) => !existingTags.includes(tag)
  );

  if (newTags.length > 0) {
    patch.tags = [...existingTags, ...newTags];
  }

  const existingLines = existing.unownedFrontmatter ?? [];
  const addedLines = missingPropertyLines(
    existingLines,
    inherited.unownedFrontmatter ?? []
  );

  if (addedLines.length > 0) {
    patch.unownedFrontmatter = [...existingLines, ...addedLines];
  }

  return patch;
}

/**
 * "Apply a template to this note": puts the template's body and merged metadata into the note
 * `noteId`, which keeps its id (and, for a daily note, its date and path). Unlike
 * createNoteFromTemplate, nothing is created.
 *
 * Order matters, and is the same for a draft and a persisted note: metadata first, then body.
 *  - Draft: updateMetadata() promotes it through persistDraft() with the session's current (empty)
 *    body, at the draft's own id and — for a daily note — its deterministic path; mutateBody() then
 *    commits the body into the open session, which autosave writes like any typing.
 *  - Persisted: updateMetadata() saves with the page's durable markdown. Run after mutateBody() it
 *    would write the old body over a session whose new body is only committed, not yet durable.
 *
 * The two steps are two Gate saves, not one atomic write: if the body step fails after the metadata
 * step succeeded, the metadata stays applied. Reapplying is safe (the merge is idempotent). The body
 * is only written while the note is still empty, so text typed in between is never overwritten.
 */
export async function applyTemplateToNote(
  pageOperations: PageOperations,
  noteId: string,
  noteType: PageType,
  existing: ExistingNoteMetadata,
  templateMarkdown: string,
  templateMetadata?: Parameters<typeof pickInheritedTemplateMetadata>[0]
): Promise<void> {
  const patch = templateMetadata
    ? pickTemplateMetadataToMerge(existing, templateMetadata, noteType)
    : {};

  if (Object.keys(patch).length > 0) {
    await pageOperations.updateMetadata(noteId, patch);
  }

  if (templateMarkdown.trim() !== '') {
    await pageOperations.mutateBody(noteId, (markdown) =>
      markdown.trim() === '' ? templateMarkdown : markdown
    );
  }
}
