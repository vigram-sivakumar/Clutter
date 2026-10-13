import { describe, expect, it, vi } from 'vitest';
import { PageOperations } from './PageOperations';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { MoveService } from '../../vault/persistence/MoveService';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { VaultPath } from '../../vault/ingest/VaultPath';
import { PagePathResolver } from './PagePathResolver';
import { PageCreator } from './PageCreator';
import { PageFactory } from './PageFactory';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { FolderOperations } from '../folder/FolderOperations';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from '../folder/FolderCreator';
import { DailyNoteService } from '../daily-notes/DailyNoteService';
import type { Page } from '../../vault/models/Page';

const ROOT = '/vault';

interface Doc {
  readonly id: string;
  readonly rel: string; // vault-relative path with extension
  readonly body: string;
  readonly frontmatter?: string; // extra frontmatter lines
}

function document({ id, body, frontmatter = '' }: Doc): string {
  return `---\nid: ${id}\n${frontmatter}---\n${body}`;
}

function buildPage(doc: Doc): Page {
  const parsed = new FrontmatterParser().parse(document(doc));
  const path = `${ROOT}/${doc.rel}`;

  return new PageBuilder().build({
    parentId: null,
    page: {
      path,
      directoryPath: VaultPath.parentDirectory(path),
      frontmatter: parsed.frontmatter,
      frontmatterAnalysis: parsed.frontmatterAnalysis,
      content: parsed.body,
      analysis: parsed.analysis,
    },
  });
}

function setup(docs: readonly Doc[]) {
  const pages = docs.map(buildPage);
  const vault = new Vault(ROOT, pages, [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const fileSystem = new InMemoryVaultFileSystem();

  for (const doc of docs) {
    fileSystem.seedFile(`${ROOT}/${doc.rel}`, document(doc));
  }

  const workspace = new Workspace();
  const documentRegistry = new DocumentRegistry();
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
    new SaveCoordinator(),
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory()),
    folderOperations,
    new DailyNoteService(),
    () => {},
    undefined,
    undefined,
    (path) => fileSystem.readFile(path)
  );

  return { vault, fileSystem, documentRegistry, coordinator, pageOperations };
}


const TARGET_BODY = '# Decisions\n\nWe decided.\n^decision-1\n\n## Action Items\n\nDo things.\n';
const TARGET: Doc = { id: 'target', rel: 'Meeting Notes.md', body: TARGET_BODY };

const REFS = [
  '[[Meeting Notes#Decisions]]',
  '![[Meeting Notes#Decisions]]',
  '[[Meeting Notes#Decisions|View decisions]]',
  '![[Meeting Notes#Decisions|View decisions]]',
];
const BLOCK_REFS = ['[[Meeting Notes#^decision-1]]', '![[Meeting Notes#^decision-1]]'];
const SOURCE: Doc = { id: 'src', rel: 'Source.md', body: [...REFS, ...BLOCK_REFS, 'prose Decisions'].join('\n') };

function bodyOf(vault: Vault, id: string): string {
  return vault.getPage(id)!.source.markdown;
}

/** The editor path: type into the open page, then let autosave (requestSave) make it durable. */
async function edit(pageOperations: PageOperations, id: string, markdown: string): Promise<void> {
  await pageOperations.open(id);
  pageOperations.commitEdit(id, markdown);
  await pageOperations.requestSave(id);
}

const renamedTo = (heading: string) => TARGET_BODY.replace('# Decisions', `# ${heading}`);
const refsTo = (heading: string) => REFS.map((ref) => ref.replace('#Decisions', `#${heading}`));

describe('heading rename -> references (editor saves)', () => {
  it('rewrites links and embeds, with and without an alias, and leaves block references and prose alone', async () => {
    const { vault, pageOperations } = setup([TARGET, SOURCE]);

    await edit(pageOperations, 'target', renamedTo('Key Decisions'));

    expect(bodyOf(vault, 'src')).toBe([...refsTo('Key Decisions'), ...BLOCK_REFS, 'prose Decisions'].join('\n'));
  });

  it('the rewritten references resolve in the index, and the old ones do not', async () => {
    const { vault, pageOperations } = setup([TARGET, SOURCE]);

    await edit(pageOperations, 'target', renamedTo('Key Decisions'));

    const edges = vault.knowledgeGraph().incomingEdges('target');
    // 4 heading references + 2 block references, every one resolved against the page's NEW headings.
    expect(edges).toHaveLength(6);
    expect(edges.filter((edge) => edge.kind === 'embed')).toHaveLength(3);
  });

  it('writes nothing for a body-only edit (no heading changed)', async () => {
    const { coordinator, pageOperations } = setup([TARGET, SOURCE]);
    const enqueue = vi.spyOn(coordinator, 'enqueue');

    await edit(pageOperations, 'target', `${TARGET_BODY}\nmore prose`);

    expect(enqueue.mock.calls.map(([id, op]) => `${id}:${op.kind}`)).toEqual(['target:save']);
  });

  it('leaves code alone', async () => {
    const body = ['```', '[[Meeting Notes#Decisions]]', '```', '', '    ![[Meeting Notes#Decisions]]', '', 'x `[[Meeting Notes#Decisions]]` y', '[[Meeting Notes#Decisions]]'].join('\n');
    const { vault, pageOperations } = setup([TARGET, { id: 'src', rel: 'Source.md', body }]);

    await edit(pageOperations, 'target', renamedTo('Key Decisions'));

    expect(bodyOf(vault, 'src')).toBe(body.replace(/\n\[\[Meeting Notes#Decisions\]\]$/, '\n[[Meeting Notes#Key Decisions]]'));
  });

  it('rewrites self-references in the page being edited, without deadlocking its own save', async () => {
    const body = `${TARGET_BODY}\nsee [[Meeting Notes#Decisions]] and ![[Meeting Notes#Decisions|x]]\n`;
    const { vault, pageOperations } = setup([{ ...TARGET, body }]);

    await edit(pageOperations, 'target', body.replace('# Decisions', '# Key Decisions'));

    const expected = body.replace('# Decisions', '# Key Decisions').replace('#Decisions]]', '#Key Decisions]]').replace('#Decisions|x', '#Key Decisions|x');
    expect(bodyOf(vault, 'target')).toBe(expected);
    expect(vault.knowledgeGraph().incomingEdges('target')).toHaveLength(2);
  });

  it('rewrites archived notes and templates', async () => {
    const archived: Doc = { id: 'arch', rel: 'Archive/Old.md', body: REFS[0]! };
    const template: Doc = { id: 'tpl', rel: 'Templates/T.md', body: REFS[1]! };
    const { vault, pageOperations } = setup([TARGET, archived, template]);

    await edit(pageOperations, 'target', renamedTo('Key Decisions'));

    expect(bodyOf(vault, 'arch')).toBe('[[Meeting Notes#Key Decisions]]');
    expect(bodyOf(vault, 'tpl')).toBe('![[Meeting Notes#Key Decisions]]');
  });

  it('follows a frontmatter alias to this page, but not a same-named heading in another note', async () => {
    const aliased: Doc = { ...TARGET, frontmatter: 'aliases: [Alpha]\n' };
    const other: Doc = { id: 'other', rel: 'Other.md', body: '# Decisions\n' };
    const src: Doc = { id: 'src', rel: 'Source.md', body: '[[Alpha#Decisions]] [[Other#Decisions]] ![[Alpha#Decisions]]' };
    const { vault, pageOperations } = setup([aliased, other, src]);

    await edit(pageOperations, 'target', renamedTo('Key Decisions'));

    expect(bodyOf(vault, 'src')).toBe('[[Alpha#Key Decisions]] [[Other#Decisions]] ![[Alpha#Key Decisions]]');
  });

  it('preserves unsaved text in an open referencing note, which stays dirty for its own autosave', async () => {
    const { vault, documentRegistry, pageOperations } = setup([TARGET, SOURCE]);
    // The target is opened first so that opening `src` (which flushes the PREVIOUS page) leaves `src` dirty.
    await pageOperations.open('target');
    await pageOperations.open('src');
    pageOperations.commitEdit('src', `${SOURCE.body}\nunsaved [[Meeting Notes#Decisions]]`);
    pageOperations.commitEdit('target', renamedTo('Key Decisions'));

    await pageOperations.requestSave('target');

    expect(documentRegistry.get('src')!.currentRevision.markdown).toBe(
      [...refsTo('Key Decisions'), ...BLOCK_REFS, 'prose Decisions', 'unsaved [[Meeting Notes#Key Decisions]]'].join('\n')
    );
    expect(documentRegistry.get('src')!.isDirty).toBe(true);
    expect(bodyOf(vault, 'src')).toBe(SOURCE.body); // durable only through its own autosave
  });

  it('does not overwrite a note that changed on disk; the others are still updated', async () => {
    const a: Doc = { id: 'a', rel: 'A.md', body: REFS[0]! };
    const b: Doc = { id: 'b', rel: 'B.md', body: REFS[0]! };
    const { vault, fileSystem, pageOperations } = setup([TARGET, a, b]);
    const external = document({ ...a, body: `${REFS[0]} edited elsewhere` });
    await fileSystem.writeFile(`${ROOT}/A.md`, external);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await edit(pageOperations, 'target', renamedTo('Key Decisions'));

    expect(await fileSystem.readFile(`${ROOT}/A.md`)).toBe(external);
    expect(bodyOf(vault, 'b')).toBe('[[Meeting Notes#Key Decisions]]');
  });
});

describe('heading edits that are NOT a single rename change nothing', () => {
  const two = '# Decisions\n\nx\n\n## Action Items\n\ny\n';

  it.each([
    ['an inserted heading', `${two}\n## Brand New\n`],
    ['a deleted heading', '# Decisions\n\nx\n'],
    ['a reordered pair', '## Action Items\n\ny\n\n# Decisions\n\nx\n'],
    ['two headings changed at once', two.replace('# Decisions', '# A').replace('## Action Items', '## B')],
    ['a level-only change', two.replace('# Decisions', '## Decisions')],
  ])('%s', async (_name, next) => {
    const { vault, pageOperations } = setup([{ ...TARGET, body: two }, SOURCE]);

    await edit(pageOperations, 'target', next);

    expect(bodyOf(vault, 'src')).toBe(SOURCE.body);
  });
});

describe('duplicate headings', () => {
  const dup = '# Decisions\n\nfirst\n\n# Decisions\n\nsecond\n';

  it('renaming the first rewrites references (they meant the first)', async () => {
    const { vault, pageOperations } = setup([{ ...TARGET, body: dup }, SOURCE]);

    await edit(pageOperations, 'target', dup.replace('# Decisions', '# Key Decisions'));

    expect(bodyOf(vault, 'src')).toContain('[[Meeting Notes#Key Decisions]]');
  });

  it('renaming a later duplicate leaves them alone', async () => {
    const { vault, pageOperations } = setup([{ ...TARGET, body: dup }, SOURCE]);

    await edit(pageOperations, 'target', dup.replace(/# Decisions\n\nsecond/, '# Key Decisions\n\nsecond'));

    expect(bodyOf(vault, 'src')).toBe(SOURCE.body);
  });
});

describe('the pending-rename baseline: retries and successive edits', () => {
  it('two successive renames are carried in order', async () => {
    const { vault, pageOperations } = setup([TARGET, SOURCE]);

    await edit(pageOperations, 'target', renamedTo('Key Decisions'));
    await edit(pageOperations, 'target', renamedTo('Final Decisions'));

    expect(bodyOf(vault, 'src')).toBe([...refsTo('Final Decisions'), ...BLOCK_REFS, 'prose Decisions'].join('\n'));
  });

  it('a source that failed is retried on the next save, even a body-only one, and nothing is rewritten twice', async () => {
    const a: Doc = { id: 'a', rel: 'A.md', body: REFS[0]! };
    const b: Doc = { id: 'b', rel: 'B.md', body: REFS[0]! };
    const { vault, pageOperations } = setup([TARGET, a, b]);
    const mutateBody = pageOperations.mutateBody.bind(pageOperations);
    let failA = true;
    vi.spyOn(pageOperations, 'mutateBody').mockImplementation((id, transform, options) =>
      id === 'a' && failA ? Promise.reject(new Error('disk full')) : mutateBody(id, transform, options)
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await edit(pageOperations, 'target', renamedTo('Key Decisions'));
    expect(bodyOf(vault, 'a')).toBe(REFS[0]);
    expect(bodyOf(vault, 'b')).toBe('[[Meeting Notes#Key Decisions]]');
    expect(warn).toHaveBeenCalled();

    failA = false;
    await edit(pageOperations, 'target', `${renamedTo('Key Decisions')}\nbody-only edit`);

    expect(bodyOf(vault, 'a')).toBe('[[Meeting Notes#Key Decisions]]');
    expect(bodyOf(vault, 'b')).toBe('[[Meeting Notes#Key Decisions]]');
  });

  it('a failed rename is not lost when the heading is renamed AGAIN: the original text is carried to the newest', async () => {
    const a: Doc = { id: 'a', rel: 'A.md', body: REFS[0]! };
    const { vault, pageOperations } = setup([TARGET, a]);
    const mutateBody = pageOperations.mutateBody.bind(pageOperations);
    let failA = true;
    vi.spyOn(pageOperations, 'mutateBody').mockImplementation((id, transform, options) =>
      failA ? Promise.reject(new Error('disk full')) : mutateBody(id, transform, options)
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await edit(pageOperations, 'target', renamedTo('Key'));
    failA = false;
    await edit(pageOperations, 'target', renamedTo('Key Decisions'));

    expect(bodyOf(vault, 'a')).toBe('[[Meeting Notes#Key Decisions]]');
  });

  it('a source skipped for an external change is retried once it is back in step', async () => {
    const a: Doc = { id: 'a', rel: 'A.md', body: REFS[0]! };
    const { vault, fileSystem, pageOperations } = setup([TARGET, a]);
    await fileSystem.writeFile(`${ROOT}/A.md`, document({ ...a, body: `${REFS[0]} external` }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await edit(pageOperations, 'target', renamedTo('Key Decisions'));
    expect(bodyOf(vault, 'a')).toBe(REFS[0]);

    // Sync reconciles the external edit into the Vault; the next save then finds disk and Vault in step.
    vault.replacePage(buildPage({ ...a, body: `${REFS[0]} external` }));
    await edit(pageOperations, 'target', `${renamedTo('Key Decisions')}\nbody-only edit`);

    expect(bodyOf(vault, 'a')).toBe('[[Meeting Notes#Key Decisions]] external');
  });

  it('clearing a heading and retyping it across autosave intervals ends with the references following the retyped text', async () => {
    const { vault, pageOperations } = setup([TARGET, SOURCE]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await edit(pageOperations, 'target', renamedTo(''));
    expect(bodyOf(vault, 'src')).toBe(SOURCE.body); // an empty heading cannot be a fragment: skipped, kept pending

    await edit(pageOperations, 'target', renamedTo('Key Decisions'));

    expect(bodyOf(vault, 'src')).toBe([...refsTo('Key Decisions'), ...BLOCK_REFS, 'prose Decisions'].join('\n'));
  });

  it.each(['A|B', '^block', 'C# Notes'])('an unsafe new heading %j is skipped and reported, producing no malformed Markdown', async (heading) => {
    const { vault, pageOperations } = setup([TARGET, SOURCE]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await edit(pageOperations, 'target', renamedTo(heading));

    expect(bodyOf(vault, 'src')).toBe(SOURCE.body);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unsupported-heading'));
  });

  it('a pending rename that can no longer be inferred is dropped with a warning, never silently', async () => {
    const a: Doc = { id: 'a', rel: 'A.md', body: REFS[0]! };
    const { vault, pageOperations } = setup([TARGET, a]);
    const mutateBody = pageOperations.mutateBody.bind(pageOperations);
    vi.spyOn(pageOperations, 'mutateBody').mockImplementation(() => Promise.reject(new Error('disk full')));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await edit(pageOperations, 'target', renamedTo('Key Decisions'));
    warn.mockClear();
    vi.spyOn(pageOperations, 'mutateBody').mockImplementation(mutateBody);
    await edit(pageOperations, 'target', `${renamedTo('Key Decisions')}\n## Brand New\n`);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not be carried'));
    expect(bodyOf(vault, 'a')).toBe(REFS[0]);
  });
});
