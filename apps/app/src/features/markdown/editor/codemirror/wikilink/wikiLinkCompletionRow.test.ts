import { describe, expect, it } from 'vitest';

import { COMPLETION_ICONS } from '../completionPopup/completionIcons';
import { embedResourceRow } from '../embed/embedCompletionRow';
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

  it('lists a Daily Note under Daily notes by its title, with no path', () => {
    const { row, section } = wikiLinkRow(page({ path: 'Daily Notes/2020/March/2020-03-05', title: '2020-03-05', breadcrumb: 'Daily Notes/2020/March', dailyNote: true }));

    expect(row.title).toBe('Thu, 5 March 2020');
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

describe('wikiLinkRow — folders and assets', () => {
  it('lists a folder under Folders, with its parent path, and the generic folder icon unless it names one', async () => {
    const { systemIconSvg } = await import('@shared/icon');
    const plain = wikiLinkRow({ kind: 'folder', path: 'Projects/Work/', title: 'Work', breadcrumb: 'Projects' });
    const inbox = wikiLinkRow({ kind: 'folder', path: 'Inbox/', title: 'Inbox', breadcrumb: null, icon: 'tray' });

    expect(plain.row).toMatchObject({ title: 'Work', path: 'Projects', iconSvg: systemIconSvg('folder') });
    expect(plain.section?.name).toBe('Folders');
    expect(inbox.row.iconSvg).toBe(systemIconSvg('tray'));
    expect(inbox.row.iconSvg).not.toBe(plain.row.iconSvg);
  });

  it('shows a folder\'s own emoji in place of the icon', () => {
    expect(wikiLinkRow({ kind: 'folder', path: 'Projects/', title: 'Projects', breadcrumb: null, emoji: '🚀' }).row).toMatchObject({ emoji: '🚀' });
  });

  it('lists images under Images and PDFs under PDFs, each with its resource icon', () => {
    const image = wikiLinkRow({ kind: 'asset', path: 'Assets/hero.png', title: 'hero', breadcrumb: 'Assets', assetKind: 'image' });
    const pdf = wikiLinkRow({ kind: 'asset', path: 'Assets/plan.pdf', title: 'plan', breadcrumb: 'Assets', assetKind: 'pdf' });

    expect(image.section?.name).toBe('Images');
    expect(image.row).toMatchObject({ title: 'hero', path: 'Assets', iconSvg: COMPLETION_ICONS.image });
    expect(pdf.section?.name).toBe('PDFs');
    expect(pdf.row.iconSvg).toBe(COMPLETION_ICONS.pdf);
    expect(image.row.thumbnail).toBeUndefined();
  });

  it('shows the same media previews as the embed popup: an image its own picture, a PDF its first page', () => {
    const image = wikiLinkRow({ kind: 'asset', path: 'a.png', title: 'a', breadcrumb: null, assetKind: 'image', previewUrl: 'app:///vault/a.png' });
    const pdf = wikiLinkRow({ kind: 'asset', path: 'a.pdf', title: 'a', breadcrumb: null, assetKind: 'pdf', previewUrl: 'blob:none' });

    expect(image.row.thumbnail).toBe('app:///vault/a.png');
    expect(pdf.row.thumbnail).toBeInstanceOf(Promise);
  });

  it('draws an asset exactly as the embed popup does — the one asset row — differing only in its section', () => {
    const wiki = wikiLinkRow({ kind: 'asset', path: 'Images/hero.png', title: 'hero', breadcrumb: 'Images', assetKind: 'image', previewUrl: 'app:///x.png' });
    const embed = embedResourceRow({ kind: 'resource', path: 'Images/hero.png', title: 'hero', breadcrumb: 'Images', resourceKind: 'image', previewUrl: 'app:///x.png' });

    expect(wiki.row).toEqual(embed.row);
    expect(wiki.section?.rank).not.toBe(embed.section?.rank);
  });

  it('orders the sections: Notes, Daily notes, Folders, Images, PDFs', () => {
    const rank = (suggestion: Parameters<typeof wikiLinkRow>[0]) => (wikiLinkRow(suggestion).section?.rank as number | undefined) ?? -1;
    const ranks = [
      rank({ kind: 'page', path: 'N', title: 'N', breadcrumb: null }),
      rank({ kind: 'page', path: 'D', title: '2020-01-01', breadcrumb: null, dailyNote: true }),
      rank({ kind: 'folder', path: 'F/', title: 'F', breadcrumb: null }),
      rank({ kind: 'asset', path: 'a.png', title: 'a', breadcrumb: null, assetKind: 'image' }),
      rank({ kind: 'asset', path: 'a.pdf', title: 'a', breadcrumb: null, assetKind: 'pdf' }),
    ];

    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(5);
  });
});

describe('wikiLinkRow — list layout (grouped / path)', () => {
  const mixed: WikiLinkSuggestion[] = [
    page(),
    { kind: 'folder', path: 'Inbox/', title: 'Inbox', breadcrumb: 'My Space', icon: 'tray' },
    { kind: 'asset', path: 'a.png', title: 'a', breadcrumb: 'Assets', assetKind: 'image', previewUrl: 'app:///a.png' },
    { kind: 'asset', path: 'a.pdf', title: 'a', breadcrumb: 'Assets', assetKind: 'pdf', previewUrl: 'blob:none' },
  ];

  it('is grouped, with paths, unless told otherwise — the layout embed autocomplete keeps', () => {
    expect(mixed.every((suggestion) => wikiLinkRow(suggestion).section !== undefined)).toBe(true);
    expect(wikiLinkRow(page()).row.path).toBe('Projects');
  });

  it('puts every row in no section when ungrouped — one continuous list, same rows otherwise', () => {
    for (const suggestion of mixed) {
      const ungrouped = wikiLinkRow(suggestion, { grouped: false, showPath: true });

      expect(ungrouped.section).toBeUndefined();
      expect(ungrouped.row).toEqual(wikiLinkRow(suggestion).row);
    }
  });

  it('keeps the icon, the reserved-folder icon and the media thumbnails when ungrouped', async () => {
    const { systemIconSvg } = await import('@shared/icon');
    const layout = { grouped: false, showPath: true };

    expect(wikiLinkRow(mixed[1]!, layout).row).toMatchObject({ iconSvg: systemIconSvg('tray'), path: 'My Space' });
    expect(wikiLinkRow(mixed[2]!, layout).row.thumbnail).toBe('app:///a.png');
    expect(wikiLinkRow(mixed[3]!, layout).row.thumbnail).toBeInstanceOf(Promise);
  });

  it('hides the path of every kind when showPath is off, leaving the icon and title', () => {
    for (const suggestion of mixed) {
      const { row } = wikiLinkRow(suggestion, { grouped: false, showPath: false });

      expect(row.path).toBeNull();
      expect(row.title).toBeTruthy();
    }
  });
});
