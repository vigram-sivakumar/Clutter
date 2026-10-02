import { describe, expect, it, vi } from 'vitest';
import type { Page } from '@core/vault/models/Page';
import { buildPageProperties } from './buildPageProperties';
import { withAllVisible } from './showAllVisibleLines';

function makePage(type: 'note' | 'daily-note', overrides: Partial<Page['metadata']> = {}): Page {
  return {
    id: 'p1',
    type,
    name: 'x',
    path: '/v/x.md',
    parentId: null,
    metadata: {
      icon: null,
      cover: null,
      coverHidden: false,
      coverLayout: 'side',
      coverPositionAbove: 50,
      coverPositionSide: 50,
      description: 'd',
      favorite: true,
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
      createdAt: '2026-01-02T03:04:05.000Z',
      updatedAt: 'not-a-date',
      tags: ['a', 'b'],
      aliases: ['Alt'],
      ...overrides,
      // Everything shown, unless the test supplies its own `properties:`
      // block (the visibility tests do): nothing is shown by default.
      unownedFrontmatter: overrides.unownedFrontmatter?.some((line) => /^properties\s*:/i.test(line))
        ? overrides.unownedFrontmatter
        : withAllVisible(overrides.unownedFrontmatter),
    },
    source: { markdown: '' },
    analysis: {
      headings: [],
      aliases: [{ value: 'Alt' }],
      blockReferences: [],
      tasks: [],
      tags: [],
      links: [],
      embeds: [],
    },
  } as unknown as Page;
}

describe('buildPageProperties', () => {
  it('exposes exactly Tags, Aliases, Created, Last edited, in order', () => {
    const items = buildPageProperties(makePage('note'));
    expect(items.map((i) => i.name)).toEqual(['Tags', 'Aliases', 'Created', 'Last edited']);
    expect(items[0]).toEqual({
      name: 'Tags',
      type: 'tag',
      value: ['a', 'b'],
      onOpenTag: undefined,
      editable: false,
    });
    expect(items[1]).toEqual({
      name: 'Aliases',
      type: 'multi-select',
      value: ['Alt'],
      editable: false,
    });
  });

  it('reads Aliases from frontmatter metadata, not the derived analysis', () => {
    const page = makePage('note', { aliases: ['From frontmatter'] });
    expect(buildPageProperties(page)[1]!.value).toEqual(['From frontmatter']);
  });

  it('makes Aliases editable with the host actions, wiring commit and suggestions', () => {
    const onCommit = vi.fn();
    const getSuggestions = vi.fn(() => []);
    const aliases = buildPageProperties(makePage('note'), { aliases: { onCommit, getSuggestions } })[1]!;

    expect(aliases).toMatchObject({ name: 'Aliases', type: 'multi-select', value: ['Alt'], editable: true });
    if (aliases.type !== 'multi-select' || !aliases.editable) throw new Error('expected editable');
    aliases.onCommit(['Alt', 'New']);
    expect(onCommit).toHaveBeenCalledWith(['Alt', 'New']);
    expect(aliases.getSuggestions).toBe(getSuggestions);
  });

  it('keeps Aliases read-only on an archived page even with host actions', () => {
    const page = makePage('note', { status: 'archived' });
    const aliases = buildPageProperties(page, { aliases: { onCommit: vi.fn() } })[1]!;
    expect(aliases.editable).toBe(false);
  });

  it('Tags is read-only without a host commit, and editable with one — never from its type', () => {
    expect(buildPageProperties(makePage('note'))[0]!.editable).toBe(false);
    expect(buildPageProperties(makePage('note'), { onOpenTag: vi.fn() })[0]!.editable).toBe(false);
    expect(buildPageProperties(makePage('note'), { onCommitTags: vi.fn() })[0]!.editable).toBe(true);
  });

  it('editable Tags commit the complete tag list and carry the suggester and tag navigation', () => {
    const onCommitTags = vi.fn();
    const getTagSuggestions = vi.fn();
    const onOpenTag = vi.fn();
    const tags = buildPageProperties(makePage('note'), { onCommitTags, getTagSuggestions, onOpenTag })[0]!;

    if (tags.type !== 'tag' || !tags.editable) throw new Error('expected editable tags');
    expect(tags.getSuggestions).toBe(getTagSuggestions);
    expect(tags.onOpenTag).toBe(onOpenTag);
    tags.onCommit(['a', 'b', 'c']);
    expect(onCommitTags).toHaveBeenCalledExactlyOnceWith(['a', 'b', 'c']);
    tags.onCommit([]);
    expect(onCommitTags).toHaveBeenLastCalledWith([]);
  });

  it('Tags stay read-only on an archived page', () => {
    const archived = buildPageProperties(makePage('note', { status: 'archived' }), {
      onCommitTags: vi.fn(),
      getTagSuggestions: vi.fn(),
    })[0]!;
    expect(archived.editable).toBe(false);
    expect(archived.type === 'tag' && archived.getSuggestions).toBeFalsy();
  });

  it('a differently-cased system key shows as the system property, never as a custom one', async () => {
    const { FrontmatterParser } = await import('@core/vault/ingest/FrontmatterParser');
    const { PageBuilder } = await import('@core/vault/ingest/PageBuilder');
    const parsed = new FrontmatterParser().parse('---\nid: p1\nALIASES:\n  - UX\nTags:\n  - work\nproperties:\n  visible:\n    - tags\n    - aliases\n    - created\n    - modified\n---\n');
    const page = new PageBuilder().build({
      parentId: null,
      page: {
        path: '/v/x.md',
        directoryPath: '/v',
        frontmatter: parsed.frontmatter,
        frontmatterAnalysis: parsed.frontmatterAnalysis,
        content: parsed.body,
        analysis: parsed.analysis,
      },
    });

    const items = buildPageProperties(page);
    expect(items.map((item) => item.name)).toEqual(['Tags', 'Aliases', 'Created', 'Last edited']);
    expect(items[0]!.value).toEqual(['work']);
    expect(items[1]!.value).toEqual(['UX']);
    // `properties` is Clutter's own configuration: never a row of its own.
    expect(items.map((item) => item.name)).not.toContain('properties');
  });

  describe('custom properties', () => {
    const custom = (overrides: Partial<Page['metadata']> = {}) =>
      makePage('note', {
        unownedFrontmatter: ['priority: high', 'estimate: 3', 'people:', '  - Ana'],
        ...overrides,
      });

    it('follow the system Properties, as read-only Properties of their inferred type', () => {
      const items = buildPageProperties(custom());
      expect(items.slice(4)).toEqual([
        { name: 'priority', type: 'text', value: 'high', editable: false },
        { name: 'estimate', type: 'number', value: 3, editable: false },
        { name: 'people', type: 'multi-select', value: ['Ana'], editable: false },
      ]);
    });

    it('get an editable name only when the host can rename; system names never do', () => {
      expect(buildPageProperties(custom()).every((item) => item.onRename === undefined)).toBe(true);

      const items = buildPageProperties(custom(), { onRenameProperty: vi.fn() });
      expect(items.slice(0, 4).every((item) => item.onRename === undefined)).toBe(true);
      expect(items.slice(4).every((item) => typeof item.onRename === 'function')).toBe(true);
    });

    it('a rename commits trimmed through the host, and is rejected (no call) for reserved, empty, or taken names', () => {
      const onRenameProperty = vi.fn();
      const priority = buildPageProperties(custom(), { onRenameProperty })[4]!;

      expect(priority.onRename!('Tags')).toBe(false);
      expect(priority.onRename!('MODIFIED')).toBe(false);
      expect(priority.onRename!('  ')).toBe(false);
      expect(priority.onRename!('estimate')).toBe(false);
      expect(onRenameProperty).not.toHaveBeenCalled();

      expect(priority.onRename!(' importance ')).toBe(true);
      expect(onRenameProperty).toHaveBeenCalledExactlyOnceWith('priority', 'importance');
    });

    it('list pills are dismissable through the host, by key, index and value', () => {
      const onRemoveListItem = vi.fn();
      const people = buildPageProperties(custom(), { onRemoveListItem })[6]!;

      if (people.type !== 'multi-select') throw new Error('expected a list');
      people.onRemoveValue!(0, 'Ana');
      expect(onRemoveListItem).toHaveBeenCalledExactlyOnceWith('people', 0, 'Ana');
    });

    it('a list is editable only when the host supplies onCommitListValue — never from its type', () => {
      const without = buildPageProperties(custom(), { onRemoveListItem: vi.fn() })[6]!;
      expect(without.editable).toBe(false);

      const onCommitListValue = vi.fn();
      const people = buildPageProperties(custom(), { onCommitListValue })[6]!;
      expect(people.editable).toBe(true);

      // Other custom properties and the system Properties stay read-only.
      const items = buildPageProperties(custom(), { onCommitListValue });
      expect(items.filter((item) => item.editable).map((item) => item.name)).toEqual(['people']);
    });

    it("commits the list's complete value through the host, by key", () => {
      const onCommitListValue = vi.fn();
      const people = buildPageProperties(custom(), { onCommitListValue })[6]!;

      if (people.type !== 'multi-select' || !people.editable) throw new Error('expected an editable list');
      people.onCommit(['Ana', 'Bo']);
      expect(onCommitListValue).toHaveBeenCalledExactlyOnceWith('people', ['Ana', 'Bo']);
    });

    it('keeps the list renamable alongside its editable value', () => {
      const onRenameProperty = vi.fn();
      const people = buildPageProperties(custom(), { onCommitListValue: vi.fn(), onRenameProperty })[6]!;

      expect(people.editable).toBe(true);
      expect(people.onRename!('team')).toBe(true);
      expect(onRenameProperty).toHaveBeenCalledExactlyOnceWith('people', 'team');
    });

    it('leaves Aliases on its own actions: onCommitListValue never makes it editable', () => {
      const aliases = buildPageProperties(custom(), { onCommitListValue: vi.fn() })[1]!;
      expect(aliases.editable).toBe(false);
    });

    it('an emptied list (`key: []`) is still an editable multi-select with no values', () => {
      const onCommitListValue = vi.fn();
      const page = custom({ unownedFrontmatter: ['people: []'] });
      const people = buildPageProperties(page, { onCommitListValue })[4]!;

      expect(people).toMatchObject({ name: 'people', type: 'multi-select', value: [], editable: true });
      if (people.type !== 'multi-select' || !people.editable) throw new Error('expected an editable list');
      people.onCommit(['Cy']);
      expect(onCommitListValue).toHaveBeenCalledExactlyOnceWith('people', ['Cy']);
    });

    describe('scalar values', () => {
      const scalars = () =>
        makePage('note', {
          unownedFrontmatter: [
            'priority: high',
            'estimate: 3',
            'done: false',
            'due: 2026-10-01',
            'site: https://a.example',
          ],
        });
      const find = (items: ReturnType<typeof buildPageProperties>, name: string) =>
        items.find((item) => item.name === name)!;

      it('are read-only without onSetScalarValue, and editable with it — never from their type', () => {
        const without = buildPageProperties(scalars(), { onRenameProperty: vi.fn() });
        expect(without.slice(4).every((item) => item.editable === false)).toBe(true);

        const withSet = buildPageProperties(scalars(), { onSetScalarValue: vi.fn() });
        expect(withSet.slice(4).every((item) => item.editable === true)).toBe(true);
        // System Properties are unaffected.
        expect(withSet.slice(0, 4).every((item) => item.editable === false)).toBe(true);
      });

      it('commit each type through the host, by key and type', () => {
        const onSetScalarValue = vi.fn();
        const items = buildPageProperties(scalars(), { onSetScalarValue });
        const commit = (name: string, value: unknown) => {
          const item = find(items, name);
          if (!item.editable) throw new Error('expected editable');
          (item.onCommit as (value: unknown) => void)(value);
        };

        commit('priority', 'low');
        commit('estimate', 5);
        commit('done', true);
        commit('due', '2026-11-01');
        commit('site', 'https://b.example');

        expect(onSetScalarValue.mock.calls).toEqual([
          ['priority', 'text', 'low'],
          ['estimate', 'number', 5],
          ['done', 'boolean', true],
          ['due', 'date', '2026-11-01'],
          ['site', 'url', 'https://b.example'],
        ]);
      });

      it('clearing sends null for text, number, date and url, so the type is kept by the write', () => {
        const onSetScalarValue = vi.fn();
        const items = buildPageProperties(scalars(), { onSetScalarValue });
        const commit = (name: string, value: unknown) =>
          (find(items, name) as { onCommit(value: unknown): void }).onCommit(value);

        commit('priority', '   ');
        commit('estimate', null);
        commit('due', null);
        commit('site', null);

        expect(onSetScalarValue.mock.calls).toEqual([
          ['priority', 'text', null],
          ['estimate', 'number', null],
          ['due', 'date', null],
          ['site', 'url', null],
        ]);
      });

      it('a typed empty reads as an empty value of its own type', () => {
        const items = buildPageProperties(
          makePage('note', { unownedFrontmatter: ['estimate: # number', 'due: # date', 'site: # url'] }),
          { onSetScalarValue: vi.fn() }
        );

        expect(items.slice(4)).toMatchObject([
          { name: 'estimate', type: 'number', value: null, editable: true },
          { name: 'due', type: 'date', value: null, editable: true },
          { name: 'site', type: 'url', value: null, editable: true },
        ]);
      });

      it('a bare domain is stored as an https URL; text that is no web URL is dropped', () => {
        const onSetScalarValue = vi.fn();
        const site = find(buildPageProperties(scalars(), { onSetScalarValue }), 'site') as {
          onCommit(value: string | null): void;
        };

        site.onCommit('example.com/a');
        site.onCommit('mailto:a@b.co');
        site.onCommit('not a url');

        expect(onSetScalarValue.mock.calls).toEqual([['site', 'url', 'https://example.com/a']]);
      });

      it('stay read-only on an archived page, and keep their rename', () => {
        const page = makePage('note', { status: 'archived', unownedFrontmatter: ['priority: high'] });
        const items = buildPageProperties(page, { onSetScalarValue: vi.fn(), onRenameProperty: vi.fn() });

        expect(items[4]!.editable).toBe(false);
        expect(items[4]!.onRename).toBeUndefined();
      });

      it('a rename stays available alongside an editable value', () => {
        const onRenameProperty = vi.fn();
        const priority = find(
          buildPageProperties(scalars(), { onSetScalarValue: vi.fn(), onRenameProperty }),
          'priority'
        );

        expect(priority.editable).toBe(true);
        expect(priority.onRename!('importance')).toBe(true);
        expect(onRenameProperty).toHaveBeenCalledExactlyOnceWith('priority', 'importance');
      });

      it('a rename to a case-variant of another property is rejected', () => {
        const onRenameProperty = vi.fn();
        const estimate = find(buildPageProperties(scalars(), { onRenameProperty }), 'estimate');

        expect(estimate.onRename!('PRIORITY')).toBe(false);
        expect(onRenameProperty).not.toHaveBeenCalled();
      });
    });

    describe('drafts (properties being added)', () => {
      const customPage = (overrides: Partial<Page['metadata']> = {}) =>
        makePage('note', { unownedFrontmatter: ['Priority: high'], ...overrides });
      const drafts = (items: { id: number; type: never; name?: string }[], over: object = {}) => ({
        items,
        onName: vi.fn(),
        onAbandon: vi.fn(),
        ...over,
      });

      it('an unnamed draft is an empty, read-only row after the custom properties, asking for its name', () => {
        const actions = drafts([{ id: 1, type: 'date' as never }]);
        const items = buildPageProperties(customPage(), { drafts: actions });

        expect(items.map((item) => item.name)).toEqual(['Tags', 'Aliases', 'Created', 'Last edited', 'Priority', '']);
        expect(items[5]).toMatchObject({ name: '', type: 'date', value: null, editable: false });
        expect(typeof items[5]!.onRename).toBe('function');
        items[5]!.onAbandon!();
        expect(actions.onAbandon).toHaveBeenCalledExactlyOnceWith(1);
      });

      it.each([
        ['text', ''],
        ['number', null],
        ['date', null],
        ['url', null],
        ['boolean', false],
        ['multi-select', []],
      ])('an unnamed %s draft shows an empty value of its own type', (type, value) => {
        const items = buildPageProperties(customPage(), { drafts: drafts([{ id: 1, type: type as never }]) });
        expect(items[5]).toMatchObject({ type, value });
      });

      it('a valid, unique name is committed through the host, trimmed', () => {
        const actions = drafts([{ id: 7, type: 'text' as never }]);
        const draft = buildPageProperties(customPage(), { drafts: actions })[5]!;

        expect(draft.onRename!('  Due date  ')).toBe(true);
        expect(actions.onName).toHaveBeenCalledExactlyOnceWith(7, 'Due date');
      });

      it.each([
        ['an empty name', ''],
        ['whitespace', '   '],
        ['a duplicate', 'Priority'],
        ['a duplicate in another case', 'priority'],
        ['a duplicate in upper case', 'PRIORITY'],
        ['a reserved system name', 'tags'],
        ['a reserved system name in another case', 'MODIFIED'],
        ['an unreadable key', 'a: b'],
      ])('%s is rejected, with no commit', (_label, name) => {
        const actions = drafts([{ id: 1, type: 'text' as never }]);
        const draft = buildPageProperties(customPage(), { drafts: actions })[5]!;

        expect(draft.onRename!(name)).toBe(false);
        expect(actions.onName).not.toHaveBeenCalled();
      });

      it('a name is also rejected when another draft is already being written under it', () => {
        const actions = drafts([
          { id: 1, type: 'text' as never, name: 'Due' },
          { id: 2, type: 'date' as never },
        ]);
        const items = buildPageProperties(customPage(), { drafts: actions });

        expect(items[5]).toMatchObject({ name: 'Due', editable: false });
        expect(items[5]!.onRename).toBeUndefined();
        expect(items[6]!.onRename!('due')).toBe(false);
        expect(actions.onName).not.toHaveBeenCalled();
      });

      it('a named draft stands in until the page shows the property, then disappears from the list', () => {
        const actions = drafts([{ id: 1, type: 'text' as never, name: 'Due' }]);

        expect(buildPageProperties(customPage(), { drafts: actions }).map((item) => item.name)).toContain('Due');

        const shown = buildPageProperties(customPage({ unownedFrontmatter: ['Priority: high', 'due:'] }), {
          drafts: actions,
        });
        expect(shown.filter((item) => item.name.toLowerCase() === 'due')).toHaveLength(1);
      });

      it('an archived page lists no drafts', () => {
        const items = buildPageProperties(customPage({ status: 'archived' }), {
          drafts: drafts([{ id: 1, type: 'text' as never }]),
        });
        expect(items.map((item) => item.name)).toEqual(['Tags', 'Aliases', 'Created', 'Last edited', 'Priority']);
      });
    });

    it('a list stays non-editable on an archived page', () => {
      const people = buildPageProperties(custom({ status: 'archived' }), { onCommitListValue: vi.fn() })[6]!;
      expect(people.editable).toBe(false);
    });

    it('are not renamable on an archived page', () => {
      const items = buildPageProperties(custom({ status: 'archived' }), { onRenameProperty: vi.fn() });
      expect(items[4]!.onRename).toBeUndefined();
    });
  });

  it('uses the same properties for Notes and Daily Notes', () => {
    expect(buildPageProperties(makePage('daily-note'))).toEqual(
      buildPageProperties(makePage('note'))
    );
  });

  it('exposes Created/Last edited as read-only date Properties carrying the raw timestamp', () => {
    const items = buildPageProperties(makePage('note', { createdAt: null }));
    expect(items[2]).toEqual({ name: 'Created', type: 'date', value: null, editable: false });
    expect(items[3]).toEqual({
      name: 'Last edited',
      type: 'date',
      value: 'not-a-date',
      editable: false,
    });
    expect(buildPageProperties(makePage('note'))[2]!.value).toBe('2026-01-02T03:04:05.000Z');
  });

  it('wires onOpenTag onto the Tags Property', () => {
    const onOpenTag = (): void => {};
    const items = buildPageProperties(makePage('note'), { onOpenTag });
    expect(items[0]).toMatchObject({ name: 'Tags', onOpenTag });
  });

  it('treats a missing tags array as empty', () => {
    expect(buildPageProperties(makePage('note', { tags: undefined }))[0]!.value).toEqual([]);
  });
});
