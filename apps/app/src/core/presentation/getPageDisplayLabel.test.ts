import { describe, expect, it } from 'vitest';
import {
  getDailyNotePreviewLabel,
  getPageDisplayLabel,
  getPageDisplayLabelStyle,
  toPageDisplayLabelInput,
} from './getPageDisplayLabel';
import { formatDailyNoteDateLabel } from './formatDailyNoteTitle';
import type { Page } from '../vault/models/Page';

const defaultMetadata: Page['metadata'] = {
  icon: null,
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
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

    expect(getPageDisplayLabel(toPageDisplayLabelInput(page))).toEqual({
      text: 'Meeting Notes',
      source: 'title',
    });
  });

  it('falls through to the placeholder when the filename is auto-generated, even with a description', () => {
    const page = makePage({
      name: 'Untitled 2',
      metadata: { ...defaultMetadata, description: 'A quick summary' },
    });

    expect(getPageDisplayLabel(toPageDisplayLabelInput(page))).toEqual({
      text: 'New Note',
      source: 'placeholder',
    });
  });

  it('falls through to the placeholder rather than body content when the filename is auto-generated', () => {
    const page = makePage({
      name: 'Untitled 3',
      source: { markdown: '- [ ] Buy milk' },
    });

    expect(getPageDisplayLabel(toPageDisplayLabelInput(page))).toEqual({
      text: 'New Note',
      source: 'placeholder',
    });
  });

  it('falls through to the placeholder when nothing else is available', () => {
    const page = makePage({ name: 'Untitled', source: { markdown: '' } });

    expect(getPageDisplayLabel(toPageDisplayLabelInput(page))).toEqual({
      text: 'New Note',
      source: 'placeholder',
    });
  });

  it('treats an empty name as absent, not as a deliberate title — only reachable via an EffectivePage draft, never a persisted Page', () => {
    expect(
      getPageDisplayLabel({
        type: 'note',
        name: '',
        description: null,
        markdown: '',
      })
    ).toEqual({
      text: 'New Note',
      source: 'placeholder',
    });
  });

  it('treats whitespace-only description as absent and still shows the placeholder, not body content', () => {
    const page = makePage({
      name: 'Untitled',
      metadata: { ...defaultMetadata, description: '   ' },
      source: { markdown: 'Real content' },
    });

    expect(getPageDisplayLabel(toPageDisplayLabelInput(page))).toEqual({
      text: 'New Note',
      source: 'placeholder',
    });
  });
});

describe('getPageDisplayLabel — Daily Notes (generic title surfaces)', () => {
  const expectedTitle = formatDailyNoteDateLabel('2026-08-02');

  it('is always the canonical date title, even with no other content', () => {
    const page = makePage({ type: 'daily-note', name: '2026-08-02' });

    expect(getPageDisplayLabel(toPageDisplayLabelInput(page))).toEqual({
      text: expectedTitle,
      source: 'title',
    });
  });

  it('is the date, not the description', () => {
    const page = makePage({
      type: 'daily-note',
      name: '2026-08-02',
      metadata: { ...defaultMetadata, description: 'Standup notes' },
    });

    expect(getPageDisplayLabel(toPageDisplayLabelInput(page)).text).toBe(expectedTitle);
  });

  it('is the date, not the body', () => {
    const page = makePage({
      type: 'daily-note',
      name: '2026-08-02',
      source: { markdown: '# Retro\nWent well today' },
    });

    expect(getPageDisplayLabel(toPageDisplayLabelInput(page)).text).toBe(expectedTitle);
  });

  it('is never the generic placeholder, and is styled as real content', () => {
    const label = getPageDisplayLabel(
      toPageDisplayLabelInput(makePage({ type: 'daily-note', name: '2026-08-02' }))
    );

    expect(label.text).not.toBe('Start typing...');
    expect(getPageDisplayLabelStyle(label)).toBe('default');
  });
});

describe('getDailyNotePreviewLabel — the Daily Notes side panel', () => {
  it('shows "Start typing..." for an empty note', () => {
    const page = makePage({ type: 'daily-note', name: '2026-08-02' });

    expect(getDailyNotePreviewLabel(toPageDisplayLabelInput(page))).toEqual({
      text: 'Start typing...',
      source: 'placeholder',
    });
  });

  it('prefers description over the content', () => {
    const page = makePage({
      type: 'daily-note',
      name: '2026-08-02',
      metadata: { ...defaultMetadata, description: 'Standup notes' },
      source: { markdown: 'Body' },
    });

    expect(getDailyNotePreviewLabel(toPageDisplayLabelInput(page))).toEqual({
      text: 'Standup notes',
      source: 'description',
    });
  });

  it('shows the content preview for a note with content', () => {
    const page = makePage({
      type: 'daily-note',
      name: '2026-08-02',
      source: { markdown: '# Retro\nWent well today' },
    });

    expect(getDailyNotePreviewLabel(toPageDisplayLabelInput(page))).toEqual({
      text: 'Retro',
      source: 'content',
    });
  });
});

describe('getPageDisplayLabelStyle', () => {
  it('is "default" for real user content — title, description, or content — regardless of page type', () => {
    expect(getPageDisplayLabelStyle({ text: 'Meeting Notes', source: 'title' })).toBe(
      'default'
    );
    expect(getPageDisplayLabelStyle({ text: 'A summary', source: 'description' })).toBe(
      'default'
    );
    expect(getPageDisplayLabelStyle({ text: 'Buy milk', source: 'content' })).toBe(
      'default'
    );
  });

  it('is "placeholder" only for the literal placeholder fallback — nothing was available at all', () => {
    expect(getPageDisplayLabelStyle({ text: 'New Note', source: 'placeholder' })).toBe(
      'placeholder'
    );
    expect(
      getPageDisplayLabelStyle({ text: 'Start typing...', source: 'placeholder' })
    ).toBe('placeholder');
  });
});
