import { describe, expect, it, vi } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { Page } from '@core/vault/models/Page';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';

import { createPageEmbedResolver } from './resolvePageEmbed';

function makeVault(pages: Page[]): Vault {
  return new Vault(
    '/vault',
    pages,
    [],
    new TagBuilder().build(pages),
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

const defaultPageMetadata = {
  icon: null,
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  description: '',
  favorite: false,
  status: 'active' as const,
  archivedAt: null,
  originalParentId: null,
  originalPath: null,
  createdAt: null,
  updatedAt: null,
};

function makePage(overrides: Partial<Page> & Pick<Page, 'id' | 'path' | 'name'>): Page {
  return {
    type: 'note',
    parentId: null,
    metadata: defaultPageMetadata,
    source: { markdown: '' },
    analysis: { headings: [], aliases: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    ...overrides,
  };
}

/** Duck-typed test double — `resolvePageEmbed.ts` only ever calls `.getPage(id)`. */
function makeEffectivePageState(
  getPage: (id: string) => { name: string; markdown: string; icon?: string | null } | undefined
): EffectivePageState {
  return { getPage } as unknown as EffectivePageState;
}

describe('createPageEmbedResolver', () => {
  it('resolves a literal vault-relative path and returns the durable markdown when no session is open', () => {
    const page = makePage({ id: 'p1', path: '/vault/Notes/Alpha.md', name: 'Alpha', source: { markdown: '# Alpha' } });
    const vault = makeVault([page]);
    const effectivePageState = makeEffectivePageState(() => undefined);

    const resolve = createPageEmbedResolver(vault, effectivePageState);
    const result = resolve('Notes/Alpha');

    expect(result).toEqual({ status: 'resolved', pageId: 'p1', title: 'Alpha', markdown: '# Alpha', icon: 'note', emoji: null });
  });

  it('returns the effective (live/session) markdown when EffectivePageState reports one, not the durable copy — Model B', () => {
    const page = makePage({ id: 'p1', path: '/vault/Alpha.md', name: 'Alpha', source: { markdown: 'Old content' } });
    const vault = makeVault([page]);
    const effectivePageState = makeEffectivePageState((id) =>
      id === 'p1' ? { name: 'Alpha', markdown: 'New uncommitted content' } : undefined
    );

    const resolve = createPageEmbedResolver(vault, effectivePageState);
    const result = resolve('Alpha');

    expect(result).toEqual({ status: 'resolved', pageId: 'p1', title: 'Alpha', markdown: 'New uncommitted content', icon: 'note', emoji: null });
  });

  it('resolves via alias when no literal path matches', () => {
    const page = makePage({
      id: 'p1',
      path: '/vault/Projects/Alpha.md',
      name: 'Alpha',
      analysis: { headings: [], aliases: [{ value: 'Alpha Project' }], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    });
    const vault = makeVault([page]);
    const effectivePageState = makeEffectivePageState(() => undefined);

    const resolve = createPageEmbedResolver(vault, effectivePageState);
    const result = resolve('Alpha Project');

    expect(result).toMatchObject({ status: 'resolved', pageId: 'p1' });
  });

  it('returns ambiguous when more than one page shares the same alias', () => {
    const alias = [{ value: 'Shared' }];
    const p1 = makePage({ id: 'p1', path: '/vault/A.md', name: 'A', analysis: { headings: [], aliases: alias, blockReferences: [], tasks: [], tags: [], links: [], embeds: [] } });
    const p2 = makePage({ id: 'p2', path: '/vault/B.md', name: 'B', analysis: { headings: [], aliases: alias, blockReferences: [], tasks: [], tags: [], links: [], embeds: [] } });
    const vault = makeVault([p1, p2]);
    const effectivePageState = makeEffectivePageState(() => undefined);

    const resolve = createPageEmbedResolver(vault, effectivePageState);
    expect(resolve('Shared')).toEqual({ status: 'ambiguous', displayLabel: 'Shared' });
  });

  it('returns unresolved when no page matches by path or alias', () => {
    const vault = makeVault([]);
    const effectivePageState = makeEffectivePageState(() => undefined);

    const resolve = createPageEmbedResolver(vault, effectivePageState);
    expect(resolve('Nonexistent Note')).toEqual({ status: 'unresolved', displayLabel: 'Nonexistent Note' });
  });

  it('never calls DocumentSession/DocumentRegistry directly — only EffectivePageState.getPage', () => {
    const page = makePage({ id: 'p1', path: '/vault/Alpha.md', name: 'Alpha' });
    const vault = makeVault([page]);
    const getPage = vi.fn().mockReturnValue(undefined);
    const effectivePageState = makeEffectivePageState(getPage);

    createPageEmbedResolver(vault, effectivePageState)('Alpha');

    expect(getPage).toHaveBeenCalledWith('p1');
    expect(getPage).toHaveBeenCalledTimes(1);
  });

  describe('heading-target embeds (![[Page#Heading]])', () => {
    const markdown = [
      '# Root causes',
      'Intro paragraph.',
      '',
      '## Details',
      'Detail paragraph.',
      '',
      '# Next steps',
      'Steps paragraph.',
    ].join('\n');

    it('resolves a top-level heading section, including the heading itself, stopping before the next same-or-higher-level heading', () => {
      const page = makePage({ id: 'p1', path: '/vault/Notes/Alpha.md', name: 'Alpha', source: { markdown } });
      const vault = makeVault([page]);
      const effectivePageState = makeEffectivePageState(() => undefined);

      const result = createPageEmbedResolver(vault, effectivePageState)('Notes/Alpha#Root causes');

      expect(result.status).toBe('resolved');
      if (result.status !== 'resolved') throw new Error('expected resolved');
      expect(result.title).toBe('Alpha › Root causes');
      // "# Root causes" through "## Details"'s own section, stopping right
      // before "# Next steps" (level 1 <= "Root causes"'s own level 1).
      expect(result.markdown).toBe(markdown.slice(0, markdown.indexOf('# Next steps')));
    });

    it('resolves a nested heading section, also stopping before the next same-or-higher-level heading even though that heading is a lower ATX level number', () => {
      const page = makePage({ id: 'p1', path: '/vault/Alpha.md', name: 'Alpha', source: { markdown } });
      const vault = makeVault([page]);
      const effectivePageState = makeEffectivePageState(() => undefined);

      const result = createPageEmbedResolver(vault, effectivePageState)('Alpha#Details');

      expect(result.status).toBe('resolved');
      if (result.status !== 'resolved') throw new Error('expected resolved');
      // "## Details"'s section stops at "# Next steps" too — level 1 is
      // <= level 2, so a higher-level heading closes a lower section.
      expect(result.markdown).toBe(markdown.slice(markdown.indexOf('## Details'), markdown.indexOf('# Next steps')));
    });

    it('resolves the last heading in a document through to the end of the document', () => {
      const page = makePage({ id: 'p1', path: '/vault/Alpha.md', name: 'Alpha', source: { markdown } });
      const vault = makeVault([page]);
      const effectivePageState = makeEffectivePageState(() => undefined);

      const result = createPageEmbedResolver(vault, effectivePageState)('Alpha#Next steps');

      expect(result.status).toBe('resolved');
      if (result.status !== 'resolved') throw new Error('expected resolved');
      expect(result.markdown).toBe(markdown.slice(markdown.indexOf('# Next steps')));
    });

    it('resolves the effective (live) markdown for heading lookup, not the durable copy — consistent with whole-note Model B', () => {
      const page = makePage({ id: 'p1', path: '/vault/Alpha.md', name: 'Alpha', source: { markdown: '# Old Heading\nold' } });
      const vault = makeVault([page]);
      const liveMarkdown = '# New Heading\nnew content';
      const effectivePageState = makeEffectivePageState((id) => (id === 'p1' ? { name: 'Alpha', markdown: liveMarkdown } : undefined));

      const result = createPageEmbedResolver(vault, effectivePageState)('Alpha#New Heading');

      expect(result).toEqual({ status: 'resolved', pageId: 'p1', title: 'Alpha › New Heading', markdown: liveMarkdown, icon: 'note', emoji: null });
    });

    it('returns unresolved-heading when the page resolves but no heading matches', () => {
      const page = makePage({ id: 'p1', path: '/vault/Alpha.md', name: 'Alpha', source: { markdown } });
      const vault = makeVault([page]);
      const effectivePageState = makeEffectivePageState(() => undefined);

      const result = createPageEmbedResolver(vault, effectivePageState)('Alpha#Nonexistent Heading');

      expect(result).toEqual({ status: 'unresolved-heading', pageId: 'p1', displayLabel: 'Alpha › Nonexistent Heading' });
    });

    it('matches the first heading in document order when duplicate heading text exists', () => {
      const duplicateMarkdown = ['# Root causes', 'first', '', '## Root causes', 'second'].join('\n');
      const page = makePage({ id: 'p1', path: '/vault/Alpha.md', name: 'Alpha', source: { markdown: duplicateMarkdown } });
      const vault = makeVault([page]);
      const effectivePageState = makeEffectivePageState(() => undefined);

      const result = createPageEmbedResolver(vault, effectivePageState)('Alpha#Root causes');

      expect(result.status).toBe('resolved');
      if (result.status !== 'resolved') throw new Error('expected resolved');
      expect(result.markdown).toBe(duplicateMarkdown);
    });

    it('matches heading text exactly (case-sensitive) after trimming surrounding whitespace from the query', () => {
      const page = makePage({ id: 'p1', path: '/vault/Alpha.md', name: 'Alpha', source: { markdown: '# Root causes\ntext' } });
      const vault = makeVault([page]);
      const effectivePageState = makeEffectivePageState(() => undefined);
      const resolve = createPageEmbedResolver(vault, effectivePageState);

      expect(resolve('Alpha# Root causes ').status).toBe('resolved');
      expect(resolve('Alpha#root causes')).toEqual({
        status: 'unresolved-heading',
        pageId: 'p1',
        displayLabel: 'Alpha › root causes',
      });
    });

    it('does not treat a bare wikilink/embed lacking # as a heading target', () => {
      const page = makePage({ id: 'p1', path: '/vault/Alpha.md', name: 'Alpha', source: { markdown: '# Alpha\nbody' } });
      const vault = makeVault([page]);
      const effectivePageState = makeEffectivePageState(() => undefined);

      const result = createPageEmbedResolver(vault, effectivePageState)('Alpha');
      expect(result).toEqual({ status: 'resolved', pageId: 'p1', title: 'Alpha', markdown: '# Alpha\nbody', icon: 'note', emoji: null });
    });
  });

  describe('icon/emoji — resolved via getPageIcon(page.type), same rule every other page representation in the app already uses', () => {
    it('a plain note gets the "note" default icon and no emoji when none is assigned', () => {
      const page = makePage({ id: 'p1', path: '/vault/Alpha.md', name: 'Alpha' });
      const vault = makeVault([page]);
      const effectivePageState = makeEffectivePageState(() => undefined);

      const result = createPageEmbedResolver(vault, effectivePageState)('Alpha');
      expect(result).toMatchObject({ icon: 'note', emoji: null });
    });

    it('a non-today daily note gets the "calendarNote" default icon, never the plain note glyph', () => {
      const page = makePage({ id: 'p1', path: '/vault/2020-01-01.md', name: '2020-01-01', type: 'daily-note' });
      const vault = makeVault([page]);
      const effectivePageState = makeEffectivePageState(() => undefined);

      const result = createPageEmbedResolver(vault, effectivePageState)('2020-01-01');
      expect(result).toMatchObject({ icon: 'calendarNote' });
    });

    it('today\'s own daily note gets the "calendarDot" variant instead', () => {
      const today = new Date().toISOString().slice(0, 10);
      const page = makePage({ id: 'p1', path: `/vault/${today}.md`, name: today, type: 'daily-note' });
      const vault = makeVault([page]);
      const effectivePageState = makeEffectivePageState(() => undefined);

      const result = createPageEmbedResolver(vault, effectivePageState)(today);
      expect(result).toMatchObject({ icon: 'calendarDot' });
    });

    it("a page's own assigned emoji (durable, no session open) is passed through as emoji, alongside the type's own default icon", () => {
      const page = makePage({
        id: 'p1',
        path: '/vault/Alpha.md',
        name: 'Alpha',
        metadata: { ...defaultPageMetadata, icon: '📌' },
      });
      const vault = makeVault([page]);
      const effectivePageState = makeEffectivePageState(() => undefined);

      const result = createPageEmbedResolver(vault, effectivePageState)('Alpha');
      expect(result).toMatchObject({ icon: 'note', emoji: '📌' });
    });

    it("the live session's own emoji override wins over the durable one, same session-wins-over-committed precedence markdown/title already follow", () => {
      const page = makePage({
        id: 'p1',
        path: '/vault/Alpha.md',
        name: 'Alpha',
        metadata: { ...defaultPageMetadata, icon: '📌' },
      });
      const vault = makeVault([page]);
      const effectivePageState = makeEffectivePageState((id) =>
        id === 'p1' ? { name: 'Alpha', markdown: '', icon: '🔥' } : undefined
      );

      const result = createPageEmbedResolver(vault, effectivePageState)('Alpha');
      expect(result).toMatchObject({ emoji: '🔥' });
    });
  });
});
