import { describe, expect, it } from 'vitest';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import {
  shouldSuggestTemplates,
  sortTemplatesByRecentUse,
  sortTemplatesNewestFirst,
} from './templateSuggestions';

const page = { type: 'note', markdown: '', isArchived: false, isInTemplatesFolder: false };

describe('shouldSuggestTemplates', () => {
  it('suggests for an empty note and an empty daily note', () => {
    expect(shouldSuggestTemplates(page)).toBe(true);
    expect(shouldSuggestTemplates({ ...page, type: 'daily-note' })).toBe(true);
  });

  it('treats whitespace-only text as empty', () => {
    expect(shouldSuggestTemplates({ ...page, markdown: ' \n\t' })).toBe(true);
  });

  it('does not suggest once the body has content', () => {
    expect(shouldSuggestTemplates({ ...page, markdown: 'x' })).toBe(false);
  });

  it('does not suggest for an archived note or a template', () => {
    expect(shouldSuggestTemplates({ ...page, isArchived: true })).toBe(false);
    expect(shouldSuggestTemplates({ ...page, isInTemplatesFolder: true })).toBe(false);
  });

  it('does not suggest for other page types', () => {
    expect(shouldSuggestTemplates({ ...page, type: 'task-list' })).toBe(false);
  });
});

const entry = (id: string, created?: string) =>
  ({ id, values: { name: id, ...(created && { created }) } }) as unknown as CollectionEntryModel;

describe('sortTemplatesNewestFirst', () => {
  it('orders by creation time, newest first', () => {
    const sorted = sortTemplatesNewestFirst([
      entry('old', '2020-01-01T00:00:00.000Z'),
      entry('new', '2024-01-01T00:00:00.000Z'),
      entry('mid', '2022-01-01T00:00:00.000Z'),
    ]);

    expect(sorted.map((template) => template.id)).toEqual(['new', 'mid', 'old']);
  });

  it('puts templates without a creation time last, in their original order', () => {
    const sorted = sortTemplatesNewestFirst([
      entry('none-1'),
      entry('dated', '2021-01-01T00:00:00.000Z'),
      entry('none-2'),
      entry('bad', 'not a date'),
    ]);

    expect(sorted.map((template) => template.id)).toEqual(['dated', 'none-1', 'none-2', 'bad']);
  });

  it('does not change the list it is given', () => {
    const input = [entry('a', '2020-01-01T00:00:00.000Z'), entry('b', '2024-01-01T00:00:00.000Z')];

    sortTemplatesNewestFirst(input);

    expect(input.map((template) => template.id)).toEqual(['a', 'b']);
  });
});

describe('sortTemplatesByRecentUse', () => {
  const none = () => undefined;
  const ids = (templates: readonly CollectionEntryModel[]) => templates.map((template) => template.id);

  it('with no usage at all, is exactly the creation-date order', () => {
    const templates = [
      entry('old', '2020-01-01T00:00:00.000Z'),
      entry('new', '2024-01-01T00:00:00.000Z'),
      entry('mid', '2022-01-01T00:00:00.000Z'),
      entry('undated'),
    ];

    expect(ids(sortTemplatesByRecentUse(templates, none))).toEqual(ids(sortTemplatesNewestFirst(templates)));
    expect(ids(sortTemplatesByRecentUse(templates, none))).toEqual(['new', 'mid', 'old', 'undated']);
  });

  it('puts the most recently used first, whatever the creation dates', () => {
    const templates = [
      entry('newest', '2024-01-01T00:00:00.000Z'),
      entry('older', '2020-01-01T00:00:00.000Z'),
      entry('oldest', '2019-01-01T00:00:00.000Z'),
    ];
    const used: Record<string, number> = {
      oldest: Date.parse('2025-06-01T00:00:00.000Z'),
      older: Date.parse('2025-03-01T00:00:00.000Z'),
    };

    expect(ids(sortTemplatesByRecentUse(templates, (id) => used[id]))).toEqual(['oldest', 'older', 'newest']);
  });

  it('ranks a never-used template by its creation date among the used ones, so a new template stays discoverable', () => {
    const templates = [
      entry('used-long-ago', '2020-01-01T00:00:00.000Z'),
      entry('created-since', '2025-05-01T00:00:00.000Z'),
      entry('used-recently', '2021-01-01T00:00:00.000Z'),
    ];
    const used: Record<string, number> = {
      'used-long-ago': Date.parse('2025-01-01T00:00:00.000Z'),
      'used-recently': Date.parse('2025-09-01T00:00:00.000Z'),
    };

    expect(ids(sortTemplatesByRecentUse(templates, (id) => used[id]))).toEqual([
      'used-recently',
      'created-since',
      'used-long-ago',
    ]);
  });

  it('a template used at all ranks by its use even if it has no creation date', () => {
    const templates = [entry('undated-unused'), entry('undated-used')];

    expect(ids(sortTemplatesByRecentUse(templates, (id) => (id === 'undated-used' ? 5 : undefined)))).toEqual([
      'undated-used',
      'undated-unused',
    ]);
  });

  it('keeps the existing order for ties, and puts a template with no time at all last', () => {
    const templates = [entry('a'), entry('b', '2022-01-01T00:00:00.000Z'), entry('c'), entry('d', '2022-01-01T00:00:00.000Z')];

    expect(ids(sortTemplatesByRecentUse(templates, none))).toEqual(['b', 'd', 'a', 'c']);
    expect(ids(sortTemplatesByRecentUse(templates, (id) => (id === 'a' || id === 'c' ? Date.parse('2023-01-01T00:00:00.000Z') : undefined)))).toEqual([
      'a',
      'c',
      'b',
      'd',
    ]);
  });

  it('does not change its input', () => {
    const templates = [entry('a', '2020-01-01T00:00:00.000Z'), entry('b', '2024-01-01T00:00:00.000Z')];

    sortTemplatesByRecentUse(templates, none);

    expect(ids(templates)).toEqual(['a', 'b']);
  });
});
