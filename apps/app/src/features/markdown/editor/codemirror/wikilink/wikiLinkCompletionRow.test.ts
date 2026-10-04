import { describe, expect, it } from 'vitest';

import { wikiLinkRow } from './wikiLinkCompletionRow';
import type { WikiLinkSuggestion } from './wikiLinkSuggestion';

const page = (overrides: Partial<Extract<WikiLinkSuggestion, { kind: 'page' }>> = {}): WikiLinkSuggestion => ({
  kind: 'page',
  path: 'Projects/Plan',
  title: 'Plan',
  breadcrumb: 'Projects',
  ...overrides,
});

describe('wikiLinkRow', () => {
  it('shows a note\'s name over its folder, in the Notes section', () => {
    const { row, section } = wikiLinkRow(page());

    expect(row).toMatchObject({ title: 'Plan', path: 'Projects' });
    expect(section?.name).toBe('Notes');
  });

  it('shows the alias a page was found by after its title, and its own emoji', () => {
    const { row } = wikiLinkRow(page({ alias: 'Roadmap', emoji: '🗺' }));

    expect(row).toMatchObject({ titleSuffix: 'Roadmap', emoji: '🗺' });
  });

  it('lists a Daily Note under Daily notes by its short date, with no path', () => {
    const { row, section } = wikiLinkRow(page({ path: 'Daily Notes/2020/March/2020-03-05', title: '2020-03-05', breadcrumb: 'Daily Notes/2020/March', dailyNote: true }));

    expect(row.title).toBe('5 Mar 2020');
    expect(row.path).toBeUndefined();
    expect(section?.name).toBe('Daily notes');
  });

  it('splits a create suggestion on the LAST "/" into name and folder, and puts it in no section', () => {
    const { row, section } = wikiLinkRow({ kind: 'create', path: 'Projects/Project A/Note', create: () => {} });

    expect(row).toMatchObject({ title: 'Create "Note"', path: 'Projects/Project A' });
    expect(section).toBeUndefined();
  });

  it('gives a create suggestion with no "/" the whole text as its name and no folder', () => {
    const { row } = wikiLinkRow({ kind: 'create', path: 'Note', create: () => {} });

    expect(row).toMatchObject({ title: 'Create "Note"', path: null });
  });
});
