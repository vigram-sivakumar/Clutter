import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';

/**
 * Whether the page offers "Start with template": an empty body (the live text — a new note, or one the
 * user has cleared) on an ordinary note or a daily note that isn't archived and isn't itself a template.
 * The type, archive and template-folder facts are the callers' existing checks; this only combines them.
 */
export function shouldSuggestTemplates(page: {
  readonly type: string;
  readonly markdown: string;
  readonly isArchived: boolean;
  readonly isInTemplatesFolder: boolean;
}): boolean {
  const isSuggestibleType = page.type === 'note' || page.type === 'daily-note';

  return isSuggestibleType && !page.isArchived && !page.isInTemplatesFolder && page.markdown.trim() === '';
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
