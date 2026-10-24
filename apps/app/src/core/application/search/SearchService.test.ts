import { describe, expect, it, vi } from 'vitest';
import { SearchService } from './SearchService';
import { PageOperations } from '../page/PageOperations';
import { EffectivePageState } from '../page/EffectivePageState';
import { MembershipSelector } from '../membership/MembershipSelector';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { Vault } from '../../vault/models/Vault';
import { VaultQuery } from '../../vault/queries/VaultQuery';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { MoveService } from '../../vault/persistence/MoveService';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { MarkdownAnalyzer } from '../../vault/ingest/analysis/MarkdownAnalyzer';
import { PagePathResolver } from '../page/PagePathResolver';
import { PageCreator } from '../page/PageCreator';
import { PageFactory } from '../page/PageFactory';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { FolderOperations } from '../folder/FolderOperations';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from '../folder/FolderCreator';
import { DailyNoteService } from '../daily-notes/DailyNoteService';
import type { Page } from '../../vault/models/Page';
import type { Folder } from '../../vault/models/Folder';
import type { VaultResource } from '../../vault/models/VaultResource';

const ROOT = '/vault';
const analyzer = new MarkdownAnalyzer();
const builder = new PageBuilder(ROOT);

interface PageSpec {
  readonly id: string;
  readonly path: string;
  readonly parentId?: string | null;
  readonly body?: string;
  readonly tags?: string[];
  readonly aliases?: string[];
}

function page(spec: PageSpec): Page {
  const content = spec.body ?? '';

  return builder.build({
    parentId: spec.parentId ?? null,
    page: {
      path: `${ROOT}/${spec.path}`,
      directoryPath: ROOT,
      frontmatter: { id: spec.id, ...(spec.tags && { tags: spec.tags }), ...(spec.aliases && { aliases: spec.aliases }) },
      frontmatterAnalysis: { aliases: (spec.aliases ?? []).map((value) => ({ value })) },
      content,
      analysis: analyzer.analyze(content),
    },
  });
}

function folder(id: string, name: string, parentId: string | null = null): Folder {
  return {
    id,
    name,
    path: `${ROOT}/${name}`,
    parentId,
    metadata: {
      icon: null,
      favorite: false,
      description: null,
      cover: null,
      coverHidden: false,
      coverLayout: 'side',
      coverPositionAbove: 50,
      coverPositionSide: 50,
      defaultTemplateId: null,
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    },
  };
}

function resource(id: string, path: string, parentId: string | null = null, kind: 'image' | 'pdf' = 'image'): VaultResource {
  const name = path.slice(path.lastIndexOf('/') + 1);

  return { id, kind, name, path: `${ROOT}/${path}`, parentId };
}

function setup(pages: Page[], folders: Folder[] = [], resources: VaultResource[] = []) {
  const vault = new Vault(ROOT, pages, folders, [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder(), new Map(), resources);
  const query = new VaultQuery(vault);
  const fileSystem = new InMemoryVaultFileSystem();
  const workspace = new Workspace();
  const documentRegistry = new DocumentRegistry();
  const saveCoordinator = new SaveCoordinator();
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    new MoveService(vault, fileSystem)
  );
  const folderOperations = new FolderOperations(
    vault,
    workspace,
    coordinator,
    new FolderPathResolver(vault),
    new FolderCreator(new UuidGenerator()),
    () => {},
    new DocumentRegistry(),
    new SaveCoordinator(),
    () => {}
  );
  const pageOperations = new PageOperations(
    vault,
    workspace,
    documentRegistry,
    saveCoordinator,
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory()),
    folderOperations,
    new DailyNoteService(),
    () => {}
  );
  const effectivePageState = new EffectivePageState(vault, query, pageOperations, workspace);
  const membershipSelector = new MembershipSelector(vault, query, effectivePageState, () => false);
  const search = new SearchService(vault, query, workspace, pageOperations, membershipSelector);

  return { vault, workspace, documentRegistry, pageOperations, effectivePageState, search };
}

const titles = (results: { title: string }[]) => results.map((result) => result.title);

describe('SearchService', () => {
  it('returns nothing for an empty query', () => {
    const { search } = setup([page({ id: 'a', path: 'Alpha.md' })]);

    expect(search.search('')).toEqual([]);
    expect(search.search('   ')).toEqual([]);
  });

  it('finds notes by title, alias, tag and body, in that order', () => {
    const { search } = setup([
      page({ id: 'body', path: 'Body.md', body: 'we discussed the roadmap today' }),
      page({ id: 'tag', path: 'Tagged.md', tags: ['roadmap'] }),
      page({ id: 'title', path: 'Roadmap.md' }),
      page({ id: 'alias', path: 'Plan.md', aliases: ['Roadmap'] }),
    ]);
    const results = search.search('roadmap');

    expect(titles(results)).toEqual(['Roadmap', 'Plan', 'Tagged', 'Body']);
    expect(results.map((result) => result.matchedBy)).toEqual(['title', 'alias', 'tag', 'body']);
    expect(results[1]!.matchedAlias).toBe('Roadmap');
    expect(results[2]!.matchedTags).toEqual(['roadmap']);
  });

  it('matches a query for "design" to a note tagged #design inline or in frontmatter', () => {
    const { search } = setup([
      page({ id: 'inline', path: 'Inline.md', body: 'a thought #design here' }),
      page({ id: 'front', path: 'Front.md', tags: ['design'] }),
      page({ id: 'other', path: 'Other.md', body: 'nothing relevant' }),
    ]);

    expect(titles(search.search('design')).sort()).toEqual(['Front', 'Inline']);
  });

  it('returns one result per page with up to three snippets', () => {
    const body = Array.from({ length: 6 }, (_, index) => `line ${index} mentions needle`).join('\n\n');
    const results = setup([page({ id: 'a', path: 'Many.md', body })]).search.search('needle');

    expect(results).toHaveLength(1);
    expect(results[0]!.snippets).toHaveLength(3);
  });

  it('searches task text through its source note, without a separate task result', () => {
    const results = setup([page({ id: 'a', path: 'Chores.md', body: '- [ ] buy oat milk\n- [x] call plumber' })]).search.search('plumber');

    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe('Chores');
    expect(results[0]!.snippets.map((snippet) => snippet.text)).toEqual(['call plumber']);
  });

  it('excludes archived and dot-prefixed pages, and finds a template, marked as one', () => {
    const { search } = setup(
      [
        page({ id: 'live', path: 'Live.md', body: 'needle' }),
        page({ id: 'archived', path: 'Archive/Old.md', body: 'needle', parentId: 'archive' }),
        page({ id: 'template', path: 'Templates/Meeting.md', body: 'needle', parentId: 'templates' }),
        page({ id: 'hidden', path: '.Secret.md', body: 'needle' }),
      ],
      [folder('archive', 'Archive'), folder('templates', 'Templates')]
    );

    const results = search.search('needle');

    expect(results.map((result) => [result.title, result.kind])).toEqual([
      ['Live', 'note'],
      ['Meeting', 'template'],
    ]);
  });

  it('finds a daily note by the way the app writes its date', () => {
    const { search } = setup([page({ id: 'd', path: 'Daily Notes/2026/August/2026-08-24.md', body: 'x' })]);
    const [result] = search.search('monday august');

    expect(result?.type).toBe('daily-note');
  });

  it('reads the open document, not the saved page, so it never waits for autosave', () => {
    const saved = page({ id: 'a', path: 'Note.md', body: 'saved text' });
    const { documentRegistry, workspace, search, pageOperations } = setup([saved]);

    expect(search.search('typed')).toEqual([]);

    documentRegistry.open(saved.id, saved.source.markdown);
    workspace.openPage(saved.id);
    pageOperations.commitEdit(saved.id, 'saved text and something freshly typed');

    const [result] = search.search('freshly');

    expect(result?.title).toBe('Note');
    expect(result?.snippets[0]?.text).toBe('saved text and something freshly typed');
    // The Vault still has the old text: the result came from the session.
    expect(saved.source.markdown).toBe('saved text');
    // …and text that was deleted in the editor is gone from the results.
    pageOperations.commitEdit(saved.id, 'replaced entirely');
    expect(search.search('saved')).toEqual([]);
  });

  it('reports ranges into the open document, which is what the editor reveals', () => {
    const saved = page({ id: 'a', path: 'Note.md', body: 'first' });
    const { documentRegistry, workspace, search, pageOperations } = setup([saved]);

    documentRegistry.open(saved.id, saved.source.markdown);
    workspace.openPage(saved.id);
    pageOperations.commitEdit(saved.id, 'line one\r\nline **two** has needle\r\n');

    const range = search.search('needle')[0]!.snippets[0]!.range;
    const editorDocument = 'line one\nline **two** has needle\n';

    expect(editorDocument.slice(range.from, range.to)).toBe('needle');
  });

  it('uses an unsaved title', () => {
    const saved = page({ id: 'a', path: 'Old name.md' });
    const { search, pageOperations } = setup([saved]);

    expect(search.search('fresh')).toEqual([]);

    pageOperations.commitTitle(saved.id, 'Fresh name');

    expect(titles(search.search('fresh'))).toEqual(['Fresh name']);
    expect(search.search('old')).toEqual([]);
  });

  it('searches a draft that is not in the Vault yet', async () => {
    const { search, pageOperations, documentRegistry } = setup([]);

    await pageOperations.openDraft({ folderId: null });
    const draftId = [...documentRegistry.getAll()][0]!.id;
    pageOperations.commitEdit(draftId, 'a draft mentioning pineapple');

    const [result] = search.search('pineapple');

    expect(result?.isDraft).toBe(true);
    expect(result?.id).toBe(draftId);
  });

  it('notifies EffectivePageState observers when an open document changes, so a UI can refresh', () => {
    const saved = page({ id: 'a', path: 'Note.md', body: 'x' });
    const { documentRegistry, workspace, pageOperations, effectivePageState } = setup([saved]);
    const listener = vi.fn();

    documentRegistry.open(saved.id, saved.source.markdown);
    workspace.openPage(saved.id);
    effectivePageState.subscribe(listener);
    listener.mockClear();

    pageOperations.commitEdit(saved.id, 'x y');
    expect(listener).toHaveBeenCalled();

    listener.mockClear();
    pageOperations.commitTitle(saved.id, 'New title');
    expect(listener).toHaveBeenCalled();
  });

  it('is read-only: it never writes or mutates the Vault', () => {
    const saved = page({ id: 'a', path: 'Note.md', body: 'needle' });
    const { vault, search } = setup([saved]);
    const replace = vi.spyOn(vault, 'replacePage');
    const add = vi.spyOn(vault, 'addPage');
    const remove = vi.spyOn(vault, 'removePage');

    search.search('needle');

    expect(replace).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('reflects a page removed or restored out of the archive on the next search', () => {
    const live = page({ id: 'a', path: 'Note.md', body: 'needle' });
    const { vault, search } = setup([live]);

    expect(search.search('needle')).toHaveLength(1);

    vault.removePage(live.id);
    expect(search.search('needle')).toEqual([]);
  });

  it('shows the folders a result lives in', () => {
    const { search } = setup(
      [page({ id: 'a', path: 'Work/Plans/Note.md', parentId: 'plans', body: 'needle' })],
      [folder('work', 'Work'), folder('plans', 'Plans', 'work')]
    );

    expect(search.search('needle')[0]!.folders).toEqual(['Work', 'Plans']);
  });
});

describe('SearchService — incremental searches', () => {
  const manyPages = (count: number) =>
    Array.from({ length: count }, (_, i) => page({ id: `p${i}`, path: `Note ${String(i).padStart(3, '0')}.md`, body: `shared needle ${i}` }));

  /** A clock that moves one tick per reading, so a budget of N means N looks at the clock. */
  function ticking() {
    let time = 0;

    return () => time++;
  }

  it('has nothing to start for an empty query', () => {
    expect(setup([]).search.startSearch('  ')).toBeUndefined();
  });

  it('finds exactly what the one-shot search finds, however finely it is stepped', () => {
    const { search } = setup(manyPages(80));
    const whole = search.search('needle', 30).map((result) => result.id);
    const job = search.startSearch('needle', 30, ticking())!;
    let steps = 0;

    while (!job.step(2)) steps++;

    expect(steps).toBeGreaterThan(3);
    expect(job.results.map((result) => result.id)).toEqual(whole);
  });

  it('pages: loadMore continues from the last result, with no repeats, until the pages run out', () => {
    const { search } = setup(manyPages(120));
    const job = search.startSearch('needle', 50)!;

    job.step(Number.POSITIVE_INFINITY);
    expect(job.results).toHaveLength(50);
    expect(job.hasMore).toBe(true);

    job.loadMore(50);
    job.step(Number.POSITIVE_INFINITY);
    expect(job.results).toHaveLength(100);

    job.loadMore(50);
    job.step(Number.POSITIVE_INFINITY);
    expect(job.results).toHaveLength(120);
    expect(job.hasMore).toBe(false);
    expect(new Set(job.results.map((result) => result.id)).size).toBe(120);
  });

  it('searches the pages as they were when it started: a page deleted meanwhile is dropped, not opened', () => {
    const pages = manyPages(10);
    const { search, vault } = setup(pages);
    const job = search.startSearch('needle', 10)!;

    vault.removePage(pages[3]!.id);
    job.step(Number.POSITIVE_INFINITY);

    expect(job.results.map((result) => result.id)).not.toContain(pages[3]!.id);
    expect(job.results).toHaveLength(9);
  });

  it('prepares every page in steps, and a search after the warm-up finds the same things', () => {
    const { search } = setup(manyPages(50));
    const before = search.search('needle', 10).map((result) => result.id);
    const warmup = setup(manyPages(50));
    const job = warmup.search.startWarmup(ticking());
    let steps = 0;

    while (!job.step(2)) steps++;

    expect(steps).toBeGreaterThan(3);
    expect(warmup.search.search('needle', 10).map((result) => result.id)).toEqual(before);
  });
});

describe('SearchService — relevance', () => {
  it('"New n" puts "New note" first and does not list every note containing an n', () => {
    const noise = Array.from({ length: 40 }, (_, i) =>
      page({ id: `noise-${i}`, path: `Banana ${i}.md`, body: 'ananas and bananas in an annual canon' })
    );
    const { search } = setup([
      ...noise,
      page({ id: 'paragraph', path: 'Paragraph.md', body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit' }),
      page({ id: 'new', path: 'New note.md', body: 'This short video will help you get comfy' }),
    ]);
    const results = search.search('New n');

    expect(titles(results)).toEqual(['New note']);
    expect(results[0]!.closeMatch).toBe(false);
  });

  it('"Naw note" finds "New note" as a close match, above a body with the exact phrase', () => {
    const { search } = setup([
      page({ id: 'close', path: 'New note.md' }),
      page({ id: 'exact-body', path: 'Elsewhere.md', body: 'a naw note appears in this sentence' }),
    ]);
    const results = search.search('Naw note');

    expect(titles(results)).toEqual(['New note', 'Elsewhere']);
    expect(results.map((result) => result.closeMatch)).toEqual([true, false]);
  });

  it('"Proejct plan" and "Metting notes" find their titles, with the matched words highlighted', () => {
    const { search } = setup([
      page({ id: 'p', path: 'Project plan.md' }),
      page({ id: 'm', path: 'Meeting notes.md' }),
    ]);
    const project = search.search('Proejct plan')[0]!;
    const meeting = search.search('Metting notes')[0]!;

    expect(project.title).toBe('Project plan');
    expect(project.closeMatch).toBe(true);
    expect(project.titleHighlights.map((range) => project.title.slice(range.from, range.to))).toEqual(['Project', 'plan']);
    expect(meeting.title).toBe('Meeting notes');
    expect(meeting.closeMatch).toBe(true);
  });

  it('puts an exact title above a close one even when the close one was edited more recently', () => {
    const { search } = setup([
      page({ id: 'close', path: 'Projekt plan.md' }),
      page({ id: 'exact', path: 'Project plan.md' }),
    ]);

    expect(titles(search.search('Project plan'))).toEqual(['Project plan', 'Projekt plan']);
  });

  it('matches an alias exactly, by prefix and by a typo, and says which alias', () => {
    const { search } = setup([page({ id: 'a', path: 'Plans.md', aliases: ['Quarterly roadmap'] })]);

    expect(search.search('quarterly roadmap')[0]).toMatchObject({ matchedBy: 'alias', matchedAlias: 'Quarterly roadmap', closeMatch: false });
    expect(search.search('quarterly')[0]).toMatchObject({ matchedBy: 'alias', closeMatch: false });
    expect(search.search('quartrly roadmap')[0]).toMatchObject({ matchedBy: 'alias', matchedAlias: 'Quarterly roadmap', closeMatch: true });
  });

  it('finds a note by a heading it contains and shows the heading as the passage', () => {
    const { search } = setup([page({ id: 'h', path: 'Notes.md', body: '# Release checklist\n\nsteps follow' })]);
    const [result] = search.search('release checklist');

    expect(result!.matchedBy).toBe('heading');
    expect(result!.snippets[0]!.text).toBe('Release checklist');
  });

  it('ranks title above alias above tag above heading above body for one word', () => {
    const { search } = setup([
      page({ id: 'body', path: 'Body.md', body: 'a thought about gardens' }),
      page({ id: 'tag', path: 'Tagged.md', tags: ['gardens'] }),
      page({ id: 'heading', path: 'Heading.md', body: '# Gardens\n\ntext' }),
      page({ id: 'alias', path: 'Alias.md', aliases: ['Gardens'] }),
      page({ id: 'title', path: 'Gardens.md' }),
    ]);

    expect(titles(search.search('gardens'))).toEqual(['Gardens', 'Alias', 'Tagged', 'Heading', 'Body']);
  });

  it('keeps finding daily notes by the date as the app writes it, and by a close spelling of the month', () => {
    const { search } = setup([page({ id: 'd', path: 'Daily Notes/2026/August/2026-08-24.md', body: 'x' })]);

    expect(search.search('aug 24')[0]?.type).toBe('daily-note');
    expect(search.search('2026-08-24')[0]?.type).toBe('daily-note');
    expect(search.search('monday')[0]?.type).toBe('daily-note');
    expect(search.search('agust 24')[0]).toMatchObject({ type: 'daily-note', closeMatch: true });
  });

  it('never matches a short word as a typo', () => {
    const { search } = setup([page({ id: 'a', path: 'Ox.md' }), page({ id: 'b', path: 'Cat.md' })]);

    expect(search.search('ax')).toEqual([]);
    expect(search.search('cx')).toEqual([]);
  });

  it('shows how many more lines match beyond the snippets', () => {
    const body = Array.from({ length: 8 }, (_, i) => `line ${i} mentions needle`).join('\n\n');
    const [result] = setup([page({ id: 'a', path: 'Many.md', body })]).search.search('needle');

    expect(result!.snippets).toHaveLength(3);
    expect(result!.moreMatches).toBe(5);
  });
});

describe('SearchService — the title is what the app shows', () => {
  it('finds an untitled note (stored as "Untitled") by the "New note" it is shown as, above body matches', () => {
    const { search } = setup([
      page({ id: 'untitled', path: 'Untitled.md', body: 'This short video will help you get comfy' }),
      page({ id: 'p', path: 'Paragraph.md', body: 'a new line commodo conquat' }),
      page({ id: 'b', path: 'Bullets.md', body: 'This is a new paragraph' }),
    ]);
    const results = search.search('new');

    expect(results[0]).toMatchObject({ id: 'untitled', title: 'New note', matchedBy: 'title', closeMatch: false });
    expect(titles(results).slice(1).sort()).toEqual(['Bullets', 'Paragraph']);
    expect(search.search('new note')[0]).toMatchObject({ id: 'untitled', matchedBy: 'title' });
  });

  it('does not offer a three-letter word as a close match for the start of a longer title word', () => {
    const { search } = setup([
      page({ id: 'nest', path: 'Multi level nesting.md' }),
      page({ id: 'untitled', path: 'Untitled.md' }),
    ]);

    expect(titles(search.search('new'))).toEqual(['New note']);
  });

  it('searches an unsaved untitled draft by its placeholder too, and a typed live title by what was typed', () => {
    const { search, pageOperations } = setup([page({ id: 'a', path: 'Old name.md' })]);

    pageOperations.commitTitle('a', '');
    expect(titles(search.search('new note'))).toEqual(['New note']);

    pageOperations.commitTitle('a', 'Quokka');
    expect(titles(search.search('quokka'))).toEqual(['Quokka']);
  });
});

describe('SearchService — query length and fuzzy highlights', () => {
  const pages = () => [
    page({ id: 'title', path: 'Tea time.md' }),
    page({ id: 'alias', path: 'Plain alpha.md', aliases: ['Tango dancing'] }),
    page({ id: 'tag', path: 'Plain beta.md', tags: ['teatime'] }),
    page({ id: 'body', path: 'Plain gamma.md', body: 'a cup of tea, and a tidy tale' }),
  ];

  it('"T" and "Te" search titles only; "Tes" and "Tea" reach aliases, tags and the visible body', () => {
    const { search } = setup(pages());

    expect(titles(search.search('t'))).toEqual(['Tea time']);
    expect(titles(search.search('te'))).toEqual(['Tea time']);
    expect(titles(search.search('T e'))).toEqual([]);
    expect(titles(search.search('tea'))).toEqual(['Tea time', 'Plain beta', 'Plain gamma']);
    expect(titles(search.search('tan'))).toEqual(['Plain alpha']);
  });

  it('whitespace-only input returns nothing, and a query is never rewritten', () => {
    const { search } = setup(pages());

    for (const blank of ['', ' ', '   ', '\t', '\n']) {
      expect(search.search(blank)).toEqual([]);
      expect(search.startSearch(blank)).toBeUndefined();
    }
  });

  it('a short query never triggers a close match', () => {
    const { search } = setup([page({ id: 'a', path: 'Ta.md' }), page({ id: 'b', path: 'Cat.md' })]);

    expect(search.search('te')).toEqual([]);
    expect(search.search('cx')).toEqual([]);
    expect(titles(search.search('tas'))).toEqual(['Ta']);
  });

  it('a close match highlights the matched title text in the source, not the misspelled query', () => {
    const { search } = setup([page({ id: 'j', path: 'Journal entries.md' })]);
    const [result] = search.search('Jornal');

    expect(result!.title).toBe('Journal entries');
    expect(result!.closeMatch).toBe(true);
    expect(result!.titleHighlights.map((range) => result!.title.slice(range.from, range.to))).toEqual(['Journal']);
  });

  it('highlights close matches at the right offsets when the title has accents and length-changing letters', () => {
    const { search } = setup([page({ id: 'u', path: 'Ünï ﬁnal naïve plan.md' })]);
    const [result] = search.search('naive plam');

    expect(result!.closeMatch).toBe(true);
    expect(result!.titleHighlights.map((range) => result!.title.slice(range.from, range.to))).toEqual(['naïve', 'plan']);
  });

  it('returns one result per page, however many ways it matches', () => {
    const { search } = setup([
      page({ id: 'one', path: 'Roadmap.md', aliases: ['Roadmap'], tags: ['roadmap'], body: '# Roadmap\n\nthe roadmap roadmap roadmap' }),
    ]);

    expect(search.search('roadmap')).toHaveLength(1);
  });

  it('a title that matches only part of a longer query ranks below a page that holds the whole phrase', () => {
    const { search } = setup([
      page({ id: 'partial', path: 'New.md', body: 'and a note, but not together' }),
      page({ id: 'whole', path: 'Other.md', body: 'start a new note today' }),
    ]);

    expect(titles(search.search('New note'))).toEqual(['Other', 'New']);
  });
});

describe('SearchService — templates, assets and folders', () => {
  const folders = () => [
    folder('templates', 'Templates'),
    folder('archive', 'Archive'),
    folder('assets', 'Assets'),
    folder('projects', 'Projects'),
  ];

  it('finds a template by title and by body, and marks it as a template with its location', () => {
    const { search } = setup(
      [
        page({ id: 'tpl', path: 'Templates/Weekly review.md', parentId: 'templates', body: 'what went well this week' }),
        page({ id: 'note', path: 'Notes.md', body: 'nothing here' }),
      ],
      folders()
    );

    expect(search.search('weekly')[0]).toMatchObject({ id: 'tpl', kind: 'template', type: 'note', folders: ['Templates'] });
    expect(search.search('went well')[0]).toMatchObject({ id: 'tpl', kind: 'template', matchedBy: 'body' });
  });

  it('a template competes by relevance, not by kind: a title match beats a body match in a note', () => {
    const { search } = setup(
      [
        page({ id: 'note', path: 'Notes.md', body: 'agenda agenda agenda agenda' }),
        page({ id: 'tpl', path: 'Templates/Agenda.md', parentId: 'templates' }),
      ],
      folders()
    );

    expect(search.search('agenda').map((result) => result.id)).toEqual(['tpl', 'note']);
  });

  it('finds assets by file name without the extension, with spaces, hyphens, underscores and Unicode', () => {
    const { search } = setup(
      [],
      folders(),
      [
        resource('a', 'Assets/Site plan v2.png'),
        resource('b', 'Assets/q3-budget_final.pdf', 'assets', 'pdf'),
        resource('c', 'Assets/Café menü.jpg'),
      ]
    );

    expect(search.search('site plan')[0]).toMatchObject({ id: 'a', kind: 'asset', assetKind: 'image', title: 'Site plan v2' });
    expect(search.search('q3-budget')[0]).toMatchObject({ id: 'b', kind: 'asset', assetKind: 'pdf', title: 'q3-budget_final' });
    expect(search.search('budget_final')[0]).toMatchObject({ id: 'b' });
    expect(search.search('cafe menu')[0]).toMatchObject({ id: 'c', title: 'Café menü' });
    expect(search.search('png')).toEqual([]);
  });

  it('never exposes a path: an asset result shows its folder names and a bare title', () => {
    const { search } = setup([], folders(), [resource('a', 'Projects/Logo.png', 'projects')]);
    const [result] = search.search('logo');

    expect(result).toMatchObject({ title: 'Logo', folders: ['Projects'], snippets: [] });
    expect(JSON.stringify(result)).not.toContain(ROOT);
  });

  it('returns an asset once, however many notes embed it', () => {
    const { search } = setup(
      [
        page({ id: 'one', path: 'One.md', body: '![](Assets/Logo.png)' }),
        page({ id: 'two', path: 'Two.md', body: '![](Assets/Logo.png)' }),
      ],
      folders(),
      [resource('a', 'Assets/Logo.png', 'assets')]
    );

    expect(search.search('logo').filter((result) => result.kind === 'asset')).toHaveLength(1);
  });

  it('searches assets by title only: one or two characters match a word start, and nothing is fuzzy', () => {
    const { search } = setup([], folders(), [resource('a', 'Assets/Sketch.png'), resource('b', 'Assets/Diagram.png')]);

    expect(titles(search.search('sk'))).toEqual(['Sketch']);
    expect(titles(search.search('sx'))).toEqual([]);
    expect(titles(search.search('skecth'))).toEqual(['Sketch']); // three or more: a close match is allowed
  });

  it('ranks notes, templates and assets in one list by match quality', () => {
    const { search } = setup(
      [
        page({ id: 'body', path: 'Misc.md', body: 'the budget was approved' }),
        page({ id: 'tpl', path: 'Templates/Budget plan.md', parentId: 'templates' }),
      ],
      folders(),
      [resource('exact', 'Assets/Budget.pdf', 'assets', 'pdf'), resource('close', 'Assets/Budgat.pdf', 'assets', 'pdf')]
    );

    expect(search.search('budget').map((result) => result.id)).toEqual(['exact', 'tpl', 'close', 'body']);
  });

  it('excludes archived, dot-hidden and remote-only assets', () => {
    const { search } = setup(
      [],
      folders(),
      [
        resource('live', 'Assets/Chart.png', 'assets'),
        resource('old', 'Archive/Chart old.png', 'archive'),
        resource('hidden', 'Assets/.Chart secret.png', 'assets'),
      ]
    );

    expect(search.search('chart').map((result) => result.id)).toEqual(['live']);
  });

  it('finds a folder by name, but not system folders, the Assets folder or archived folders', () => {
    const { search } = setup(
      [],
      [...folders(), folder('inner', 'Projects archive notes', 'projects'), folder('old', 'Old projects', 'archive')],
      []
    );

    expect(search.search('projects').map((result) => [result.id, result.kind])).toEqual([
      ['projects', 'folder'],
      ['inner', 'folder'],
    ]);
    expect(search.search('templates')).toEqual([]);
    expect(search.search('assets')).toEqual([]);
    expect(search.search('archive').map((result) => result.id)).toEqual(['inner']);
  });

  it('reflects a title edit of a template on the next search', () => {
    const { search, pageOperations } = setup(
      [page({ id: 'tpl', path: 'Templates/Weekly.md', parentId: 'templates' })],
      folders()
    );

    pageOperations.commitTitle('tpl', 'Standup');
    expect(search.search('standup')[0]).toMatchObject({ id: 'tpl', kind: 'template' });
  });
});

describe('SearchService — alias highlights', () => {
  it('points at the matched words of the alias, in the alias text', () => {
    const { search } = setup([page({ id: 'a', path: 'Plan.md', aliases: ['This is another Name for the note'] })]);
    const [result] = search.search('name');

    expect(result).toMatchObject({ matchedBy: 'alias', matchedAlias: 'This is another Name for the note' });
    expect(result!.aliasHighlights!.map((range) => result!.matchedAlias!.slice(range.from, range.to))).toEqual(['Name']);
  });
});
