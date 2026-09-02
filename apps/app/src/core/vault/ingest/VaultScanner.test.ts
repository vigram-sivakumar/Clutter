import { describe, expect, it } from 'vitest';
import { VaultScanner } from './VaultScanner';
import type { VaultEntry, VaultFileSystem } from '../providers';

class FakeFileSystem implements VaultFileSystem {
  constructor(
    private readonly directories: Map<string, VaultEntry[]>,
    private readonly files: Map<string, string>
  ) {}

  async exists(path: string): Promise<boolean> {
    return this.directories.has(path) || this.files.has(path);
  }

  async createDirectory(): Promise<void> {}

  async readDirectory(path: string): Promise<VaultEntry[]> {
    return this.directories.get(path) ?? [];
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`No such file: ${path}`);
    }
    return content;
  }

  async writeFile(): Promise<void> {}
  async deleteFile(): Promise<void> {}
  async moveFile(): Promise<void> {}
  async copyFile(): Promise<void> {}
}

function entry(name: string, path: string, isDirectory: boolean): VaultEntry {
  return { name, path, isDirectory };
}

describe('VaultScanner dot-prefixed entries', () => {
  it('excludes only the reserved .clutter directory from the scan result', async () => {
    const fileSystem = new FakeFileSystem(
      new Map([
        [
          '/vault',
          [
            entry('.git', '/vault/.git', true),
            entry('.clutter', '/vault/.clutter', true),
            entry('.Project', '/vault/.Project', true),
            entry('Notes', '/vault/Notes', true),
          ],
        ],
        ['/vault/.git', []],
        ['/vault/.clutter', []],
        ['/vault/.Project', []],
        ['/vault/Notes', []],
      ]),
      new Map()
    );

    const scanner = new VaultScanner(fileSystem);
    const result = await scanner.scan('/vault');

    const scannedPaths = result.directories.map((directory) => directory.path);

    expect(scannedPaths).toContain('/vault');
    expect(scannedPaths).toContain('/vault/Notes');
    expect(scannedPaths).toContain('/vault/.git');
    expect(scannedPaths).toContain('/vault/.Project');
    expect(scannedPaths).not.toContain('/vault/.clutter');
  });

  it('discovers dot-prefixed markdown files as ordinary pages', async () => {
    const fileSystem = new FakeFileSystem(
      new Map([
        [
          '/vault',
          [
            entry('.archive.md', '/vault/.archive.md', false),
            entry('Idea.md', '/vault/Idea.md', false),
          ],
        ],
      ]),
      new Map([
        ['/vault/Idea.md', '---\n---\ncontent'],
        ['/vault/.archive.md', '---\n---\ncontent'],
      ])
    );

    const scanner = new VaultScanner(fileSystem);
    const result = await scanner.scan('/vault');

    const scannedPaths = result.pages.map((page) => page.path);

    expect(scannedPaths).toContain('/vault/Idea.md');
    expect(scannedPaths).toContain('/vault/.archive.md');
  });

  it('still reads .folder.md as folder frontmatter rather than treating it as an ordinary page', async () => {
    const fileSystem = new FakeFileSystem(
      new Map([
        [
          '/vault',
          [entry('.folder.md', '/vault/.folder.md', false)],
        ],
      ]),
      new Map([
        [
          '/vault/.folder.md',
          '---\nicon: 📁\n---\n',
        ],
      ])
    );

    const scanner = new VaultScanner(fileSystem);
    const result = await scanner.scan('/vault');

    expect(result.directories).toHaveLength(1);
    expect(result.directories[0]!.frontmatter?.icon).toBe('📁');
    expect(result.pages).toHaveLength(0);
  });

  it('does not descend into the reserved .clutter directory, even if it contains further content', async () => {
    const fileSystem = new FakeFileSystem(
      new Map([
        ['/vault', [entry('.clutter', '/vault/.clutter', true)]],
        [
          '/vault/.clutter',
          [entry('workspace.json', '/vault/.clutter/workspace.json', false)],
        ],
      ]),
      new Map()
    );

    const scanner = new VaultScanner(fileSystem);
    const result = await scanner.scan('/vault');

    expect(result.directories.map((d) => d.path)).toEqual(['/vault']);
    expect(result.pages).toHaveLength(0);
  });

  it('does not exclude a nested folder even if it happens to be named .clutter', async () => {
    const fileSystem = new FakeFileSystem(
      new Map([
        ['/vault', [entry('Notes', '/vault/Notes', true)]],
        ['/vault/Notes', [entry('.clutter', '/vault/Notes/.clutter', true)]],
        ['/vault/Notes/.clutter', []],
      ]),
      new Map()
    );

    const scanner = new VaultScanner(fileSystem);
    const result = await scanner.scan('/vault');

    expect(result.directories.map((d) => d.path)).toContain('/vault/Notes/.clutter');
  });
});

describe('VaultScanner supported resource files', () => {
  it('still discovers .md files as pages exactly as before', async () => {
    const fileSystem = new FakeFileSystem(
      new Map([['/vault', [entry('Idea.md', '/vault/Idea.md', false)]]]),
      new Map([['/vault/Idea.md', '---\n---\ncontent']])
    );

    const scanner = new VaultScanner(fileSystem);
    const result = await scanner.scan('/vault');

    expect(result.pages.map((page) => page.path)).toEqual(['/vault/Idea.md']);
    expect(result.files).toEqual([]);
  });

  it('recognizes a .pdf file as a supported resource file', async () => {
    const fileSystem = new FakeFileSystem(
      new Map([['/vault', [entry('Report.pdf', '/vault/Report.pdf', false)]]]),
      new Map()
    );

    const scanner = new VaultScanner(fileSystem);
    const result = await scanner.scan('/vault');

    expect(result.files).toEqual([
      { path: '/vault/Report.pdf', directoryPath: '/vault', kind: 'pdf' },
    ]);
    expect(result.pages).toEqual([]);
  });

  it('recognizes supported image files as resource files', async () => {
    const fileSystem = new FakeFileSystem(
      new Map([
        [
          '/vault',
          [
            entry('Photo.png', '/vault/Photo.png', false),
            entry('Scan.jpeg', '/vault/Scan.jpeg', false),
          ],
        ],
      ]),
      new Map()
    );

    const scanner = new VaultScanner(fileSystem);
    const result = await scanner.scan('/vault');

    expect(result.files).toEqual([
      { path: '/vault/Photo.png', directoryPath: '/vault', kind: 'image' },
      { path: '/vault/Scan.jpeg', directoryPath: '/vault', kind: 'image' },
    ]);
  });

  it('excludes unsupported file types from both pages and files', async () => {
    const fileSystem = new FakeFileSystem(
      new Map([['/vault', [entry('notes.txt', '/vault/notes.txt', false)]]]),
      new Map()
    );

    const scanner = new VaultScanner(fileSystem);
    const result = await scanner.scan('/vault');

    expect(result.pages).toEqual([]);
    expect(result.files).toEqual([]);
  });

  it('continues to discover directories normally alongside resource files', async () => {
    const fileSystem = new FakeFileSystem(
      new Map([
        [
          '/vault',
          [
            entry('Assets', '/vault/Assets', true),
            entry('Cover.png', '/vault/Cover.png', false),
          ],
        ],
        ['/vault/Assets', []],
      ]),
      new Map()
    );

    const scanner = new VaultScanner(fileSystem);
    const result = await scanner.scan('/vault');

    expect(result.directories.map((d) => d.path)).toEqual(['/vault', '/vault/Assets']);
    expect(result.files).toEqual([
      { path: '/vault/Cover.png', directoryPath: '/vault', kind: 'image' },
    ]);
  });

  it('does not read the content of a non-Markdown resource file through the Markdown document-loading path', async () => {
    // No entry in the `files` map for Report.pdf — FakeFileSystem.readFile
    // throws for any path not present there. If the scanner ever routed a
    // .pdf through DocumentLoader.load (which calls readFile), this test
    // would fail with "No such file" instead of resolving.
    const fileSystem = new FakeFileSystem(
      new Map([['/vault', [entry('Report.pdf', '/vault/Report.pdf', false)]]]),
      new Map()
    );

    const scanner = new VaultScanner(fileSystem);

    await expect(scanner.scan('/vault')).resolves.toBeDefined();
  });
});
