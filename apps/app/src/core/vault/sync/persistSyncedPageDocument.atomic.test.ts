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
import { fingerprint } from '../../shared/identity/textFingerprint';

const ROOT = '/vault';
const PATH = `${ROOT}/Note.md`;

async function setup(options: { atomic: boolean; identity?: boolean }) {
  const disk = new InMemoryVaultFileSystem();
  const serializer = new FrontmatterSerializer();
  const parser = new FrontmatterParser();
  const rebuilder = new PageRebuilder();
  const writer = new InMemoryAtomicVaultWriter(disk);
  const fileSystem = options.atomic ? new AtomicWriteFileSystem(disk, writer) : disk;

  // The page as the scan built it, from the file as it was then.
  const scannedText = '---\nid: page-1\n---\nbody as scanned';
  disk.seedFile(PATH, scannedText);
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
      ...(options.identity && { sourceFingerprint: fingerprint(scannedText) }),
    },
  });
  const vault = new Vault(ROOT, [page], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const stale: string[] = [];
  const deps = { fileSystem, vault, serializer, parser, rebuilder, onStale: (path: string) => stale.push(path) };

  return { disk, writer, page, vault, deps, stale };
}

describe('persistSyncedPageDocument under the atomic provider: a repair never overwrites what it did not inspect', () => {
  it('repairs the file it inspected, replacing it only while it still holds the text it read', async () => {
    const { disk, writer, page, deps } = await setup({ atomic: true });

    const repaired = await persistSyncedPageDocument(deps, { ...page, id: 'page-1' }, 'body as scanned');

    expect(await disk.readFile(PATH)).toContain('id: page-1');
    expect(writer.calls).toContain(`write:replaceIfContent:${PATH}`);
    expect(repaired?.path).toBe(PATH);
  });

  it('does not overwrite an external edit made after the page was inspected, and leaves the vault page as it was', async () => {
    const { disk, writer, page, vault, deps } = await setup({ atomic: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await disk.writeFile(PATH, '---\nid: page-1\n---\nan external edit');

    const result = await persistSyncedPageDocument(deps, page, 'body as scanned');

    expect(await disk.readFile(PATH)).toContain('an external edit');
    expect(writer.calls.some((call) => call.startsWith('write:'))).toBe(false);
    expect(result).toBeNull();
    expect(vault.getPage(page.id)).toBe(page);
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

    await expect(persistSyncedPageDocument(deps, page, 'body as scanned', 'text read earlier')).resolves.toBeNull();

    expect(await disk.exists(PATH)).toBe(false);
    warn.mockRestore();
  });

  describe('with the content identity the page was built from', () => {
    it('refuses a repair when the file holds different text even though its modification time did not move', async () => {
      const { disk, writer, page, deps, stale } = await setup({ atomic: true, identity: true });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const times = await disk.stat(PATH);
      await disk.writeFile(PATH, '---\nid: page-1\n---\nedited by another app');
      disk.setFileTimes(PATH, { createdAt: times.createdAt!, modifiedAt: times.modifiedAt! }); // an unreliable timestamp

      await persistSyncedPageDocument(deps, page, 'body as scanned');

      expect(await disk.readFile(PATH)).toContain('edited by another app');
      expect(writer.calls.some((call) => call.startsWith('write:'))).toBe(false);
      expect(stale).toEqual([PATH]);
      warn.mockRestore();
    });

    it('repairs when the file still holds exactly the text the page was built from, and records the new identity', async () => {
      const { disk, page, deps, stale, vault } = await setup({ atomic: true, identity: true });

      const repaired = await persistSyncedPageDocument(deps, page, 'body as scanned');

      expect(stale).toEqual([]);
      expect(repaired?.sourceFingerprint).toBe(fingerprint(await disk.readFile(PATH)));
      expect(vault.getPage(page.id)?.sourceFingerprint).toBe(repaired?.sourceFingerprint);
    });

    it('a caller’s inspected text that is not what the page was built from is refused too', async () => {
      const { disk, page, deps, stale } = await setup({ atomic: true, identity: true });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      await persistSyncedPageDocument(deps, page, 'body as scanned', '---\nid: page-1\n---\nsomething else');

      expect(stale).toEqual([PATH]);
      expect(await disk.readFile(PATH)).toContain('body as scanned');
      warn.mockRestore();
    });
  });

  it('a stale refusal asks the caller to reconcile the path (the modification-time fallback too)', async () => {
    const { disk, page, deps, stale } = await setup({ atomic: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await disk.writeFile(PATH, '---\nid: page-1\n---\nan external edit');

    await persistSyncedPageDocument(deps, page, 'body as scanned');

    expect(stale).toEqual([PATH]);
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
