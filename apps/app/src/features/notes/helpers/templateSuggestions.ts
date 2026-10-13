import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';

/**
 * Whether a draft offers "Start with template": it has an empty body (the live text) and is not itself
 * a template being authored. The caller offers this only for an unpersisted draft (a new note, or a daily
 * note not yet written), so a saved note — empty or not — never asks. The draft and Templates-folder
 * facts are the caller's existing checks; this only combines them with the body.
 */
export function shouldSuggestTemplates(draft: {
  readonly markdown: string;
  readonly isInTemplatesFolder: boolean;
}): boolean {
  return !draft.isInTemplatesFolder && draft.markdown.trim() === '';
}

function createdTime(entry: CollectionEntryModel): number | null {
  const created: unknown = entry.values.created;
  const time = created == null ? Number.NaN : Date.parse(String(created));

  return Number.isNaN(time) ? null : time;
}

/** Newest time first; a template with no time goes last, keeping its order. Ties keep their order too. */
function sortByTimeDescending(
  templates: readonly CollectionEntryModel[],
  timeOf: (template: CollectionEntryModel) => number | null
): CollectionEntryModel[] {
  return templates
    .map((template, index) => ({ template, index, time: timeOf(template) }))
    .sort((a, b) => {
      if (a.time === null || b.time === null) {
        return a.time === b.time ? a.index - b.index : a.time === null ? 1 : -1;
      }

      return b.time - a.time || a.index - b.index;
    })
    .map(({ template }) => template);
}

/** Newest-created first; a template with no (or an unreadable) creation time goes last, keeping its order. */
export function sortTemplatesNewestFirst(
  templates: readonly CollectionEntryModel[]
): CollectionEntryModel[] {
  return sortByTimeDescending(templates, createdTime);
}

/**
 * The inline "Start with template" row's order: most recently used first. A template that has been used ranks
 * by when it was last used, one that never was by when it was created — so a newly created template sits
 * among the recent ones instead of sinking below every used one. With no usage at all this is exactly
 * `sortTemplatesNewestFirst`. `lastUsedAt` is the usage store's lookup (`undefined` for never used).
 */
export function sortTemplatesByRecentUse(
  templates: readonly CollectionEntryModel[],
  lastUsedAt: (templateId: string) => number | undefined
): CollectionEntryModel[] {
  return sortByTimeDescending(templates, (template) => lastUsedAt(template.id) ?? createdTime(template));
}
