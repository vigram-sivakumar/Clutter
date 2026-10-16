import { describe, expect, it, vi } from 'vitest';

import { MarkdownAnalyzer } from '@core/vault/ingest/analysis/MarkdownAnalyzer';
import { PageAnalysisMapper } from '@core/vault/ingest/PageAnalysisMapper';
import { KnowledgeGraphBuilder } from '@core/vault/knowledge/KnowledgeGraphBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { TaskBuilder } from '@core/vault/knowledge/TaskBuilder';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { Vault } from '@core/vault/models/Vault';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';

import { getPageReferences } from './getPageReferences';

const ROOT = '/vault';
const analyzer = new MarkdownAnalyzer();
const mapper = new PageAnalysisMapper();

const pageMeta = {
  icon: null, cover: null, coverHidden: false, coverLayout: 'side' as const, coverPositionAbove: 50,
  coverPositionSide: 50, description: '', favorite: false, status: 'active' as const, archivedAt: null,
  originalParentId: null, originalPath: null, createdAt: null, updatedAt: null,
};
const folderMeta = {
  defaultTemplateId: null, icon: null, favorite: false, description: '', cover: null, coverHidden: false,
  coverLayout: 'side' as const, coverPositionAbove: 50, coverPositionSide: 50, status: 'active' as const,
  archivedAt: null, originalPath: null, originalParentId: null,
};

function page(id: string, relativePath: string, markdown = '', overrides: Partial<Page> = {}): Page {
  const scanned = analyzer.analyze(markdown);

  return {
    id,
    type: 'note',
    name: relativePath.split('/').pop()!.replace(/\.md$/, ''),
    path: `${ROOT}/${relativePath}`,
    parentId: null,
    metadata: pageMeta,
    source: { markdown },
    analysis: {
      headings: [], aliases: [], blockReferences: [],
      tasks: mapper.buildTasks(id, scanned.tasks),
      tags: mapper.buildTags(id, scanned.tags),
      links: mapper.buildLinks(id, scanned.links),
      embeds: mapper.buildEmbeds(id, scanned.embeds),
    },
    ...overrides,
  } as Page;
}

const daily = (date: string, markdown: string) => page(`d-${date}`, `Daily Notes/${date}.md`, markdown, { type: 'daily-note' });

function makeVault(pages: Page[], folders: Folder[] = []): Vault {
  const builder = new KnowledgeGraphBuilder();

  return new Vault(
    ROOT,
    pages,
    folders,
    new TagBuilder().build(pages, new Map()),
    new TaskBuilder().build(pages),
    [],
    builder.build(pages, pages.flatMap((p) => p.analysis.links), pages.flatMap((p) => p.analysis.embeds), ROOT),
    new VaultProjectionBuilder(),
    new Map()
  );
}

const TARGET = page('target', 'Projects/Target.md');
const ids = (references: readonly { page: Page }[]) => references.map((reference) => reference.page.id);

describe('getPageReferences', () => {
  it('is empty when nothing references the page', () => {
    const references = getPageReferences(makeVault([TARGET, page('x', 'X.md', 'unrelated')]), 'target');

    expect(references).toEqual({ tasks: [], notes: [], dailyNotes: [] });
  });

  it('puts tasks, notes and daily notes in their own groups; a daily note is never a note', () => {
    const vault = makeVault([
      TARGET,
      page('note', 'Note.md', 'Mentions [[Projects/Target]]'),
      page('task-note', 'TaskNote.md', '- [ ] Follow up [[Projects/Target]]'),
      daily('2026-10-10', 'Today: [[Projects/Target]]'),
    ]);
    const references = getPageReferences(vault, 'target');

    expect(references.tasks.map(({ task }) => task.text)).toEqual(['Follow up [[Projects/Target]]']);
    // The task-only note is represented by its task entry, not listed a second time.
    expect(ids(references.notes)).toEqual(['note']);
    expect(ids(references.dailyNotes)).toEqual(['d-2026-10-10']);
  });

  it('lists only tasks whose own line references the page, not other tasks in a referencing note', () => {
    const vault = makeVault([
      TARGET,
      page('n', 'N.md', '- [ ] unrelated task\n- [ ] linked [[Projects/Target]]\nSee [[Projects/Target]] too'),
    ]);

    expect(getPageReferences(vault, 'target').tasks.map(({ task }) => task.text)).toEqual(['linked [[Projects/Target]]']);
  });

  it('counts an embedded task line the same as a linked one', () => {
    const vault = makeVault([TARGET, page('n', 'N.md', '- [ ] with embed ![[Projects/Target]]')]);

    expect(getPageReferences(vault, 'target').tasks).toHaveLength(1);
  });

  it('gives each task the page its line lives in, for the entry header', () => {
    const vault = makeVault([TARGET, page('t', 'Planner.md', '- [ ] Follow up [[Projects/Target]]')]);

    expect(getPageReferences(vault, 'target').tasks.map(({ page: source }) => source.id)).toEqual(['t']);
  });

  it('gives a note its referencing line as its excerpt, without the list or heading marker', () => {
    const vault = makeVault([
      TARGET,
      page('a', 'A.md', 'Intro line\nWe decided on [[Projects/Target]] today.'),
      page('c', 'C.md', '## Heading with ![[Projects/Target]]'),
      page('q', 'Q.md', '> Quoted [[Projects/Target]]'),
    ]);
    const excerpts = Object.fromEntries(
      getPageReferences(vault, 'target').notes.map(({ page: source, excerpt }) => [source.id, excerpt])
    );

    expect(excerpts).toEqual({
      a: 'We decided on [[Projects/Target]] today.',
      c: 'Heading with ![[Projects/Target]]',
      q: 'Quoted [[Projects/Target]]',
    });
  });

  it('gives a note only the referencing line, for the editor preview', () => {
    const vault = makeVault([
      TARGET,
      page('p', 'P.md', 'Intro\n\nA paragraph with **bold**\nand a [[Projects/Target]] link.\nlast line\n\nOutro'),
      page('l', 'L.md', '- top\n  - nested [[Projects/Target]]\n    - child'),
    ]);
    const lines = Object.fromEntries(
      getPageReferences(vault, 'target').notes.map(({ page: source, line }) => [source.id, line])
    );

    expect(lines).toEqual({
      p: 'and a [[Projects/Target]] link.',
      l: '- nested [[Projects/Target]]',
    });
  });

  it('has no line to preview when it is too long, leaving the compact excerpt as the fallback', () => {
    const vault = makeVault([TARGET, page('big', 'Big.md', `${'x'.repeat(1600)} [[Projects/Target]]`)]);
    const [note] = getPageReferences(vault, 'target').notes;

    expect(note!.line).toBeNull();
    expect(note!.excerpt).toContain('[[Projects/Target]]');
  });

  it('does not list a note again when every reference in it is on a task line', () => {
    const vault = makeVault([
      TARGET,
      page('only-tasks', 'OnlyTasks.md', '- [ ] one [[Projects/Target]]\n- [x] two ![[Projects/Target]]'),
      page('daily-only-tasks', 'Daily Notes/2026-10-10.md', '- [ ] today [[Projects/Target]]', { type: 'daily-note' }),
    ]);
    const references = getPageReferences(vault, 'target');

    expect(references.tasks).toHaveLength(3);
    expect(references.notes).toEqual([]);
    expect(references.dailyNotes).toEqual([]);
  });

  it('lists a note that references the page both on a task line and elsewhere — from the non-task reference only', () => {
    const markdown = '- [ ] task line [[Projects/Target]]\nPlain mention of [[Projects/Target]] here';
    const vault = makeVault([TARGET, page('mixed', 'Mixed.md', markdown)]);
    const references = getPageReferences(vault, 'target');
    const [note] = references.notes;

    expect(references.tasks).toHaveLength(1);
    expect(ids(references.notes)).toEqual(['mixed']);
    expect(note!.excerpt).toBe('Plain mention of [[Projects/Target]] here');
    // Its reveal covers the plain mention only; the task line is revealed by the task entry.
    expect(note!.ranges.map((range) => markdown.slice(range.from, range.to))).toEqual(['[[Projects/Target]]']);
    expect(note!.ranges[0]!.from).toBeGreaterThan(markdown.indexOf('\n'));
  });

  it('does the same for a daily note: a plain mention is listed, a task-only mention is not', () => {
    const vault = makeVault([
      TARGET,
      page('plain', 'Daily Notes/2026-10-11.md', 'Met about [[Projects/Target]]', { type: 'daily-note' }),
      page('tasks', 'Daily Notes/2026-10-10.md', '- [ ] [[Projects/Target]]', { type: 'daily-note' }),
    ]);

    expect(ids(getPageReferences(vault, 'target').dailyNotes)).toEqual(['plain']);
  });

  const modified = (modifiedAt: string | null): Partial<Page> => ({ fileTimes: { createdAt: null, modifiedAt } });
  const taskTexts = (vault: Vault) =>
    getPageReferences(vault, 'target').tasks.map(({ task }) => task.text.replace(' [[Projects/Target]]', ''));

  it('orders open tasks by due date ascending, undated after dated, ties going to the most recently modified note', () => {
    const vault = makeVault([
      TARGET,
      page('old', 'Old.md', '- [ ] dated old @2026-10-20 [[Projects/Target]]\n- [ ] undated old [[Projects/Target]]', modified('2026-01-01T00:00:00Z')),
      page('new', 'New.md', '- [ ] dated new @2026-10-20 [[Projects/Target]]\n- [ ] undated new [[Projects/Target]]', modified('2026-06-01T00:00:00Z')),
      page('soon', 'Soon.md', '- [ ] soonest @2026-10-12 [[Projects/Target]]', modified('2025-01-01T00:00:00Z')),
    ]);

    expect(taskTexts(vault)).toEqual([
      'soonest @2026-10-12',
      'dated new @2026-10-20',
      'dated old @2026-10-20',
      'undated new',
      'undated old',
    ]);
  });

  it('puts completed tasks after every open task, most recently completed first', () => {
    const vault = makeVault([
      TARGET,
      page(
        'a',
        'A.md',
        '- [x] done early @completed:2026-10-01 [[Projects/Target]]\n- [ ] open undated [[Projects/Target]]\n- [x] done late @completed:2026-10-09 [[Projects/Target]]\n- [ ] open dated @2026-12-01 [[Projects/Target]]'
      ),
    ]);

    expect(taskTexts(vault)).toEqual(['open dated @2026-12-01', 'open undated', 'done late', 'done early']);
  });

  it('orders completed tasks with no completion date after the dated completions, by due date', () => {
    const vault = makeVault([
      TARGET,
      page(
        'a',
        'A.md',
        '- [x] done no stamp undated [[Projects/Target]]\n- [x] done no stamp @2026-10-05 [[Projects/Target]]\n- [x] done stamped @completed:2026-09-01 [[Projects/Target]]'
      ),
    ]);

    expect(taskTexts(vault)).toEqual(['done stamped', 'done no stamp @2026-10-05', 'done no stamp undated']);
  });

  it('sorts notes by modified date newest first, then A–Z, with an unstamped note last', () => {
    const vault = makeVault([
      TARGET,
      page('z', 'zebra.md', '[[Projects/Target]]', modified('2026-05-01T00:00:00Z')),
      page('a', 'Apple.md', '[[Projects/Target]]', modified('2026-05-01T00:00:00Z')),
      page('fresh', 'Mango.md', '[[Projects/Target]]', modified('2026-09-01T00:00:00Z')),
      page('none', 'Banana.md', '[[Projects/Target]]', modified(null)),
    ]);

    expect(ids(getPageReferences(vault, 'target').notes)).toEqual(['fresh', 'a', 'z', 'none']);
  });

  it('sorts daily notes newest first', () => {
    const vault = makeVault([
      TARGET,
      daily('2026-10-01', '[[Projects/Target]]'),
      daily('2026-10-09', '[[Projects/Target]]'),
      daily('2026-09-30', '[[Projects/Target]]'),
    ]);

    expect(ids(getPageReferences(vault, 'target').dailyNotes)).toEqual([
      'd-2026-10-09',
      'd-2026-10-01',
      'd-2026-09-30',
    ]);
  });

  it('shows a line once even when it links and embeds the page several times, with every range to reveal', () => {
    const markdown = 'other\n[[Projects/Target]] ![[Projects/Target]] again [[Projects/Target]]\nmore';
    const vault = makeVault([TARGET, page('n', 'N.md', markdown)]);
    const [reference] = getPageReferences(vault, 'target').notes;

    expect(getPageReferences(vault, 'target').notes).toHaveLength(1);
    expect(reference!.ranges.map((range) => markdown.slice(range.from, range.to))).toEqual([
      '[[Projects/Target]]',
      '![[Projects/Target]]',
      '[[Projects/Target]]',
    ]);
  });

  it('works for a daily note as the open page', () => {
    const today = daily('2026-10-11', '');
    const vault = makeVault([today, page('n', 'N.md', 'On [[Daily Notes/2026-10-11]] I decided')]);

    expect(ids(getPageReferences(vault, today.id).notes)).toEqual(['n']);
  });

  it('ignores a self-reference', () => {
    const self = page('self', 'Self.md', 'I mention [[Self]]');

    expect(getPageReferences(makeVault([self]), 'self')).toEqual({ tasks: [], notes: [], dailyNotes: [] });
  });

  it('leaves out sources in Templates and in Archive', () => {
    const folders: Folder[] = [
      { id: 'f-templates', name: 'Templates', path: `${ROOT}/Templates`, parentId: null, metadata: folderMeta },
      { id: 'f-archive', name: 'Archive', path: `${ROOT}/Archive`, parentId: null, metadata: folderMeta },
    ];
    const vault = makeVault(
      [
        TARGET,
        page('tpl', 'Templates/Tpl.md', '- [ ] [[Projects/Target]]', { parentId: 'f-templates' }),
        page('old', 'Archive/Old.md', '- [ ] [[Projects/Target]]', { parentId: 'f-archive' }),
        page('live', 'Live.md', '[[Projects/Target]]'),
      ],
      folders
    );
    const references = getPageReferences(vault, 'target');

    expect(ids(references.notes)).toEqual(['live']);
    expect(references.tasks).toEqual([]);
  });

  it('identifies sources by page id, so renaming the source or the target changes nothing', () => {
    const vault = makeVault([TARGET, page('n', 'Renamed/Elsewhere.md', '[[Projects/Target]]')]);

    expect(ids(getPageReferences(vault, 'target').notes)).toEqual(['n']);
  });

  it('reads the graph, never the vault-wide page or task lists, and reuses it until a mutation', () => {
    const vault = makeVault([TARGET, page('n', 'N.md', '- [ ] [[Projects/Target]]')]);
    const pages = vi.spyOn(vault, 'pages');
    const tasks = vi.spyOn(vault, 'tasks');

    getPageReferences(vault, 'target');
    getPageReferences(vault, 'target');

    expect(pages).not.toHaveBeenCalled();
    expect(tasks).not.toHaveBeenCalled();
  });

  it('follows edits: a reference added, then removed, from the source note', () => {
    const vault = makeVault([TARGET, page('n', 'N.md', 'nothing')]);

    expect(getPageReferences(vault, 'target').notes).toEqual([]);

    vault.replacePage(page('n', 'N.md', 'now [[Projects/Target]]'));
    expect(ids(getPageReferences(vault, 'target').notes)).toEqual(['n']);

    vault.replacePage(page('n', 'N.md', 'gone'));
    expect(getPageReferences(vault, 'target').notes).toEqual([]);
  });

  it('drops a source that is deleted', () => {
    const vault = makeVault([TARGET, page('n', 'N.md', '[[Projects/Target]]')]);

    vault.removePage('n');

    expect(getPageReferences(vault, 'target').notes).toEqual([]);
  });
  describe('one entry per referencing line, direct references only', () => {
    const T = '[[Projects/Target]]';
    const refs = (markdown: string, type: Page['type'] = 'note') =>
      getPageReferences(
        makeVault([
          TARGET,
          type === 'daily-note' ? daily('2026-10-10', markdown) : page('n', 'N.md', markdown),
        ]),
        'target'
      );

    it('lists a page that links the target, not a page that only embeds that page (no transitive references)', () => {
      const noteB = page('b', 'B.md', 'B');
      const noteA = page('a', 'A.md', 'A mentions [[B]]');
      const noteC = page('c', 'C.md', '![[A]]');
      const vault = makeVault([noteB, noteA, noteC]);

      // C embeds A, and A's own link to B is not C's.
      expect(ids(getPageReferences(vault, 'b').notes)).toEqual(['a']);
      // An embed is a direct reference to the page it embeds.
      expect(ids(getPageReferences(vault, 'a').notes)).toEqual(['c']);
    });

    it('shows only the referencing line between two adjacent non-empty lines, with no blank lines needed', () => {
      const markdown = `Another line Above that\nThis is here as well ${T}\nAnother line below that`;
      const { notes } = refs(markdown);

      expect(notes.map((entry) => entry.line)).toEqual([`This is here as well ${T}`]);
      expect(notes[0]!.excerpt).toBe(`This is here as well ${T}`);
      expect(markdown.slice(notes[0]!.ranges[0]!.from, notes[0]!.ranges[0]!.to)).toBe(T);
    });

    it('shows only the referencing line of a daily note', () => {
      const { dailyNotes } = refs(`This is here ${T}\n\nAnother line below that`, 'daily-note');

      expect(dailyNotes.map((entry) => entry.line)).toEqual([`This is here ${T}`]);
    });

    it('shows one entry for several mentions on one line', () => {
      const { notes } = refs(`${T} and ${T} and ${T}\nnext line`);

      expect(notes).toHaveLength(1);
      expect(notes[0]!.ranges).toHaveLength(3);
      expect(notes[0]!.line).toBe(`${T} and ${T} and ${T}`);
    });

    it('gives each referencing line its own entry, even inside one paragraph, list, quote or heading block', () => {
      const markdown = [
        `First ${T}`,
        `second line of the paragraph ${T}`,
        'unrelated line',
        '',
        `- item ${T}`,
        '- other item',
        `- another ${T}`,
        '',
        `> quote ${T}`,
        `> quote again ${T}`,
        '',
        `## Heading ${T}`,
      ].join('\n');
      const { notes } = refs(markdown);

      expect(notes.map((entry) => entry.line)).toEqual([
        `First ${T}`,
        `second line of the paragraph ${T}`,
        `- item ${T}`,
        `- another ${T}`,
        `> quote ${T}`,
        `> quote again ${T}`,
        `## Heading ${T}`,
      ]);
      for (const entry of notes) {
        expect(entry.ranges).toHaveLength(1);
        expect(markdown.slice(entry.ranges[0]!.from, entry.ranges[0]!.to)).toBe(T);
      }
      expect(new Set(notes.map((entry) => entry.lineFrom)).size).toBe(7);
    });

    it('keeps inline formatting on the line and drops only its indentation', () => {
      const { notes } = refs(`- top\n    - nested **bold** and ${T} ~~old~~`);

      expect(notes.map((entry) => entry.line)).toEqual([`- nested **bold** and ${T} ~~old~~`]);
    });

    it('does not preview a line that holds an embed in the editor, so the embedded content never renders', () => {
      const { notes } = refs(`before\nsee ![[Projects/Target]] now\nafter`);

      expect(notes).toHaveLength(1);
      expect(notes[0]!.line).toBeNull();
      expect(notes[0]!.excerpt).toBe('see ![[Projects/Target]] now');
    });

    it('keeps tasks separate from note entries of the same page', () => {
      const references = refs(`Prose ${T}\n- [ ] task ${T}\nmore prose`);

      expect(references.tasks.map(({ task }) => task.text)).toEqual([`task ${T}`]);
      expect(references.notes.map((entry) => entry.line)).toEqual([`Prose ${T}`]);
    });

    it('lists both a parent list item and its child task when each references the page', () => {
      const references = refs(`- parent ${T}\n  - [ ] child ${T}`);

      expect(references.tasks).toHaveLength(1);
      expect(references.notes.map((entry) => entry.line)).toEqual([`- parent ${T}`]);
    });

    it('ignores links and embeds written inside fenced or inline code', () => {
      const markdown = [
        '```',
        T,
        '![[Projects/Target]]',
        '```',
        '',
        `~~~md\n${T}\n~~~`,
        '',
        `Inline \`${T}\` and \`![[Projects/Target]]\` only`,
      ].join('\n');

      expect(refs(markdown)).toEqual({ tasks: [], notes: [], dailyNotes: [] });
    });

    it('still counts a reference next to code', () => {
      const { notes } = refs(`\`code\` then ${T}\n\n\`\`\`\n${T}\n\`\`\``);

      expect(notes.map((entry) => entry.line)).toEqual([`\`code\` then ${T}`]);
    });
  });
});
