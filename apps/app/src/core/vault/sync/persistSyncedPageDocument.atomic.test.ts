import { describe, expect, it, vi } from 'vitest';
import { AtomicWriteFileSystem } from '../atomicWrite/AtomicWriteFileSystem';
import { FrontmatterParser } from '../ingest/FrontmatterParser';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { PageBuilder } from '../ingest/PageBuilder';
import { PageRebuilder } from '../ingest/PageRebuilder';
import { readPageFileTimes } from '../ingest/readResourceMetadata';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { InMemoryAtomicVaultWriter } from '../testing/InMemoryAtomicVaultWriter';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { persistSyncedPageDocument } from './persistSyncedPageDocument';

const ROOT = '/vault';
const PATH = `${ROOT}/Note.md`;

async function setup(options: { atomic: boolean }) {
  const disk = new InMemoryVaultFileSystem();
  const serializer = new FrontmatterSerializer();
  const parser = new FrontmatterParser();
  const rebuilder = new PageRebuilder();
  const writer = new InMemoryAtomicVaultWriter(disk);
  const fileSystem = options.atomic ? new AtomicWriteFileSystem(disk, writer) : disk;

  // The page as the scan built it, from the file as it was then.
  disk.seedFile(PATH, '---\nid: page-1\n---\nbody as scanned');
  const times = await readPageFileTimes(disk, PATH);
  const page = new PageBuilder().build({
    parentId: null,
    page: {
      path: PATH,
      directoryPath: ROOT,
      frontmatter: { id: 'page-1' },
      frontmatterAnalysis: { aliases: [] },
      content: 'body as scanned',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
      ...(times && { fileTimes: times }),
    },
  });
  const vault = new Vault(ROOT, [page], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const deps = { fileSystem, vault, serializer, parser, rebuilder };

  return { disk, writer, page, vault, deps };
}

describe('persistSyncedPageDocument under the atomic provider: a repair never overwrites what it did not inspect', () => {
  it('repairs the file it inspected, replacing it only while it still holds the text it read', async () => {
    const { disk, writer, page, deps } = await setup({ atomic: true });

    const repaired = await persistSyncedPageDocument(deps, { ...page, id: 'page-1' }, 'body as scanned');

    expect(await disk.readFile(PATH)).toContain('id: page-1');
    expect(writer.calls).toContain(`write:replaceIfContent:${PATH}`);
    expect(repaired.path).toBe(PATH);
  });

  it('does not overwrite an external edit made after the page was inspected, and leaves the vault page as it was', async () => {
    const { disk, writer, page, vault, deps } = await setup({ atomic: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await disk.writeFile(PATH, '---\nid: page-1\n---\nan external edit');

    const result = await persistSyncedPageDocument(deps, page, 'body as scanned');

    expect(await disk.readFile(PATH)).toContain('an external edit');
    expect(writer.calls.some((call) => call.startsWith('write:'))).toBe(false);
    expect(result).toBe(vault.getPage(page.id));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not overwrite an edit that lands between its read and its write', async () => {
    const { disk, writer, page, deps } = await setup({ atomic: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const write = writer.write.bind(writer);
    vi.spyOn(writer, 'write').mockImplementation(async (attempt) => {
      await disk.writeFile(PATH, '---\nid: page-1\n---\nlanded in the gap');
      disk.setFileTimes(PATH, { createdAt: new Date(0), modifiedAt: new Date(0) });

      return write(attempt);
    });

    await persistSyncedPageDocument(deps, page, 'body as scanned');

    expect(await disk.readFile(PATH)).toContain('landed in the gap');
    warn.mockRestore();
  });

  it('the text the caller inspected is the precondition: a file that no longer holds it is not overwritten', async () => {
    const { disk, page, deps } = await setup({ atomic: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await persistSyncedPageDocument(deps, page, 'body as scanned', '---\nid: page-1\n---\nwhat the caller read earlier');

    expect(await disk.readFile(PATH)).toBe('---\nid: page-1\n---\nbody as scanned');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a note deleted since it was inspected is not re-created by the repair', async () => {
    const { disk, page, deps } = await setup({ atomic: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await disk.deleteFile(PATH);

    await expect(persistSyncedPageDocument(deps, page, 'body as scanned', 'text read earlier')).resolves.toBeDefined();

    expect(await disk.exists(PATH)).toBe(false);
    warn.mockRestore();
  });

  it('any other provider writes exactly as before (a plain replace, no precondition)', async () => {
    const { disk, page, deps } = await setup({ atomic: false });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await disk.writeFile(PATH, '---\nid: page-1\n---\nan external edit');

    await persistSyncedPageDocument(deps, page, 'body as scanned');

    expect(await disk.readFile(PATH)).toContain('body as scanned');
  });
});
