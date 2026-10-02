import { describe, expect, it } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { Page } from '@core/vault/models/Page';

import { createAliasSuggester } from './aliasSuggestions';

function makePage(id: string, path: string, aliases: string[] = [], markdown = ''): Page {
  return {
    id,
    type: 'note',
    name: path.slice(path.lastIndexOf('/') + 1, -3),
    path,
    parentId: null,
    metadata: {
      icon: null,
      cover: null,
      coverHidden: false,
      coverLayout: 'side',
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
      aliases,
    },
    source: { markdown },
    analysis: {
      headings: [],
      aliases: aliases.map((value) => ({ value })),
      blockReferences: [],
      tasks: [],
      tags: [],
      links: [],
      embeds: [],
    },
  };
}

function suggesterFor(pages: Page[], currentPageId: string) {
  const vault = new Vault('/vault', pages, [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  return createAliasSuggester(vault, currentPageId);
}

describe('createAliasSuggester — existing aliases in the vault, never pages', () => {
  const current = makePage('me', '/vault/Me.md', ['Mine']);
  const labels = (suggestions: { label: string }[]) => suggestions.map((row) => row.label);

  it('suggests the aliases defined across the vault: typing `h` finds Heyo and Hello world', () => {
    const suggest = suggesterFor(
      [
        current,
        makePage('a', '/vault/A.md', ['Heyo', 'Hello world']),
        makePage('b', '/vault/B.md', ['Design system', 'UI architecture']),
      ],
      'me'
    );

    // `UI architecture` contains an `h` but no word starts with it.
    expect(labels(suggest('h'))).toEqual(['Hello world', 'Heyo']);
    expect(labels(suggest('design'))).toEqual(['Design system']);
    expect(labels(suggest('arch'))).toEqual(['UI architecture']);
  });

  it('aggregates aliases from several notes and flattens multi-value aliases', () => {
    const suggest = suggesterFor(
      [
        current,
        makePage('a', '/vault/A.md', ['Dashboard', 'Daily']),
        makePage('b', '/vault/B.md', ['Design system']),
        makePage('c', '/vault/C.md', ['Draft']),
      ],
      'me'
    );

    expect(labels(suggest('d'))).toEqual(['Daily', 'Dashboard', 'Design system', 'Draft']);
  });

  it('deduplicates case-insensitively into one suggestion, in the most-used spelling', () => {
    const suggest = suggesterFor(
      [
        current,
        makePage('a', '/vault/A.md', ['UX']),
        makePage('b', '/vault/B.md', ['ux']),
        makePage('c', '/vault/C.md', ['ux']),
        makePage('d', '/vault/D.md', ['Ux']),
      ],
      'me'
    );

    expect(suggest('u')).toEqual([{ key: 'ux', value: 'ux', label: 'ux', detail: null }]);
  });

  it('a spelling tie is broken the same way every time, whichever page is read first', () => {
    const pages = [makePage('a', '/vault/A.md', ['UX']), makePage('b', '/vault/B.md', ['ux'])];

    expect(suggesterFor([current, ...pages], 'me')('u')[0]!.value).toBe(
      suggesterFor([current, ...pages.reverse()], 'me')('u')[0]!.value
    );
  });

  it('matches case-insensitively by word start: the alias, or any word in it, begins with the typed text', () => {
    const suggest = suggesterFor([current, makePage('a', '/vault/A.md', ['Design System'])], 'me');

    expect(labels(suggest('SYS'))).toEqual(['Design System']);
    expect(labels(suggest('design s'))).toEqual(['Design System']);
    // Not a mid-word substring.
    expect(suggest('ign')).toEqual([]);
    expect(suggest('zzz')).toEqual([]);
  });

  it("excludes aliases the current page already has, in any letter case — but not other pages' aliases", () => {
    const withOwn = makePage('me', '/vault/Me.md', ['Mine', 'Heyo']);
    const suggest = suggesterFor(
      [withOwn, makePage('a', '/vault/A.md', ['HEYO', 'Hello world']), makePage('b', '/vault/B.md', ['Mine too'])],
      'me'
    );

    expect(labels(suggest('h'))).toEqual(['Hello world']);
    expect(labels(suggest('mine'))).toEqual(['Mine too']);
  });

  it('never suggests a note title, even when it contains the typed text', () => {
    const suggest = suggesterFor(
      [
        current,
        makePage('a', '/vault/Bold & italic story.md'),
        makePage('b', '/vault/Cover image.md'),
        makePage('c', '/vault/Fenced code.md'),
        makePage('d', '/vault/Daily.md', ['Dashboard']),
      ],
      'me'
    );

    expect(labels(suggest('d'))).toEqual(['Dashboard']);
    expect(suggest('cover')).toEqual([]);
    expect(suggest('code')).toEqual([]);
  });

  it('never suggests a page path or folder name', () => {
    const suggest = suggesterFor([current, makePage('a', '/vault/Design/Guidelines/Page.md')], 'me');

    expect(suggest('guidelines')).toEqual([]);
    expect(suggest('design')).toEqual([]);
    expect(suggest('vault')).toEqual([]);
  });

  it('never suggests text from a page’s content', () => {
    const page = makePage('a', '/vault/A.md', ['Alpha'], '# Heading\n\nA paragraph about Kubernetes and [[Links]] with #tags');
    const suggest = suggesterFor([current, page], 'me');

    expect(suggest('kubernetes')).toEqual([]);
    expect(suggest('heading')).toEqual([]);
    expect(labels(suggest('alp'))).toEqual(['Alpha']);
  });

  it('a suggestion is a plain value, not a relationship: no page is named', () => {
    const suggest = suggesterFor([current, makePage('a', '/vault/Note A.md', ['Dashboard'])], 'me');

    expect(suggest('dash')).toEqual([{ key: 'dashboard', value: 'Dashboard', label: 'Dashboard', detail: null }]);
  });

  it('ignores empty and blank values, and trims the ones it keeps', () => {
    const suggest = suggesterFor([current, makePage('a', '/vault/A.md', ['', '   ', '  Spaced  '])], 'me');

    expect(labels(suggest('s'))).toEqual(['Spaced']);
  });

  it('suggests nothing for empty text', () => {
    expect(suggesterFor([current, makePage('a', '/vault/A.md', ['Heyo'])], 'me')('  ')).toEqual([]);
  });
});

describe('differently-cased aliases in WikiLink resolution', () => {
  it('a page whose file says `ALIASES:` is found by its alias in [[ autocomplete and resolution', async () => {
    const { FrontmatterParser } = await import('@core/vault/ingest/FrontmatterParser');
    const { PageBuilder } = await import('@core/vault/ingest/PageBuilder');
    const { findPagesByAlias } = await import('./resolveWikiLink');
    const { findPageMatches } = await import('./wikiLinkSuggestions');
    const parsed = new FrontmatterParser().parse('---\nid: g\nALIASES:\n  - UX\n---\n');
    const page = new PageBuilder().build({
      parentId: null,
      page: {
        path: '/vault/Design/User Experience Guidelines.md',
        directoryPath: '/vault/Design',
        frontmatter: parsed.frontmatter,
        frontmatterAnalysis: parsed.frontmatterAnalysis,
        content: parsed.body,
        analysis: parsed.analysis,
      },
    });
    const vault = new Vault('/vault', [page], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());

    expect(findPagesByAlias(vault, 'UX').map((match) => match.id)).toEqual(['g']);
    expect(findPageMatches(vault.pages(), 'ux')).toEqual([{ page, alias: 'UX' }]);
  });
});
