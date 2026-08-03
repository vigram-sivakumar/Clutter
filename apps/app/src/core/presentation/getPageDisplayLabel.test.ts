import { describe, expect, it } from 'vitest';
import { getPageDisplayLabel, getPageDisplayLabelStyle } from './getPageDisplayLabel';
import type { Page } from '../vault/models/Page';

const defaultMetadata: Page['metadata'] = {
  icon: null,
  cover: null,
  description: null,
  favorite: false,
  status: 'active',
  archivedAt: null,
  originalParentId: null,
  originalPath: null,
  createdAt: null,
  updatedAt: null,
};

const defaultAnalysis: Page['analysis'] = {
  headings: [],
  aliases: [],
  blockReferences: [],
  tasks: [],
  tags: [],
  links: [],
  embeds: [],
};

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: 'page-1',
    type: 'note',
    name: 'Untitled',
    path: '/vault/Untitled.md',
    parentId: null,
    metadata: defaultMetadata,
    source: { markdown: '' },
    analysis: defaultAnalysis,
    ...overrides,
  };
}

describe('getPageDisplayLabel — Notes', () => {
  it('uses the filename when it looks deliberately chosen', () => {
    const page = makePage({ name: 'Meeting Notes' });

    expect(getPageDisplayLabel(page)).toEqual({
      text: 'Meeting Notes',
      source: 'title',
    });
  });

  it('falls through to description when the filename is auto-generated', () => {
    const page = makePage({
      name: 'Untitled 2',
      metadata: { ...defaultMetadata, description: 'A quick summary' },
    });

    expect(getPageDisplayLabel(page)).toEqual({
      text: 'A quick summary',
      source: 'description',
    });
  });

  it('falls through to body content when there is no description', () => {
    const page = makePage({
      name: 'Untitled 3',
      source: { markdown: '- [ ] Buy milk' },
    });

    expect(getPageDisplayLabel(page)).toEqual({
      text: 'Buy milk',
      source: 'content',
    });
  });

  it('falls through to the placeholder when nothing else is available', () => {
    const page = makePage({ name: 'Untitled', source: { markdown: '' } });

    expect(getPageDisplayLabel(page)).toEqual({
      text: 'New Note',
      source: 'placeholder',
    });
  });

  it('treats whitespace-only description as absent', () => {
    const page = makePage({
      name: 'Untitled',
      metadata: { ...defaultMetadata, description: '   ' },
      source: { markdown: 'Real content' },
    });

    expect(getPageDisplayLabel(page)).toEqual({
      text: 'Real content',
      source: 'content',
    });
  });
});

describe('getPageDisplayLabel — Daily Notes', () => {
  it('never treats the date filename as a meaningful title, even without other content', () => {
    const page = makePage({ type: 'daily-note', name: '2026-08-02' });

    expect(getPageDisplayLabel(page)).toEqual({
      text: 'Start typing...',
      source: 'placeholder',
    });
  });

  it('prefers description over the date', () => {
    const page = makePage({
      type: 'daily-note',
      name: '2026-08-02',
      metadata: { ...defaultMetadata, description: 'Standup notes' },
    });

    expect(getPageDisplayLabel(page)).toEqual({
      text: 'Standup notes',
      source: 'description',
    });
  });

  it('prefers body content over the date', () => {
    const page = makePage({
      type: 'daily-note',
      name: '2026-08-02',
      source: { markdown: '# Retro\nWent well today' },
    });

    expect(getPageDisplayLabel(page)).toEqual({
      text: 'Retro',
      source: 'content',
    });
  });
});

describe('getPageDisplayLabelStyle — Notes', () => {
  const notePage = makePage({ type: 'note' });

  it('is "default" only for the real explicit title', () => {
    expect(
      getPageDisplayLabelStyle(notePage, { text: 'Meeting Notes', source: 'title' })
    ).toBe('default');
  });

  it('is "placeholder" for every inferred source, not only the literal placeholder', () => {
    expect(
      getPageDisplayLabelStyle(notePage, { text: 'A summary', source: 'description' })
    ).toBe('placeholder');
    expect(
      getPageDisplayLabelStyle(notePage, { text: 'Buy milk', source: 'content' })
    ).toBe('placeholder');
    expect(
      getPageDisplayLabelStyle(notePage, { text: 'New Note', source: 'placeholder' })
    ).toBe('placeholder');
  });
});

describe('getPageDisplayLabelStyle — Daily Notes', () => {
  const dailyNotePage = makePage({ type: 'daily-note' });

  it('is "default" for description or content — real, deliberate information, not a stand-in for the date (which is never shown here at all)', () => {
    expect(
      getPageDisplayLabelStyle(dailyNotePage, {
        text: 'Standup notes',
        source: 'description',
      })
    ).toBe('default');
    expect(
      getPageDisplayLabelStyle(dailyNotePage, { text: 'Retro', source: 'content' })
    ).toBe('default');
  });

  it('is "placeholder" for the literal "Start typing..." fallback — nothing was available at all', () => {
    expect(
      getPageDisplayLabelStyle(dailyNotePage, {
        text: 'Start typing...',
        source: 'placeholder',
      })
    ).toBe('placeholder');
  });

  it('is still "default" even for the (unreachable in practice) source "title"', () => {
    expect(
      getPageDisplayLabelStyle(dailyNotePage, { text: '2026-08-02', source: 'title' })
    ).toBe('default');
  });
});
