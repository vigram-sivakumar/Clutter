import { describe, expect, it } from 'vitest';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { shouldSuggestTemplates, sortTemplatesNewestFirst } from './templateSuggestions';

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
