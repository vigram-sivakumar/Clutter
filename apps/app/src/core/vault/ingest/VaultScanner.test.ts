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
}

function entry(name: string, path: string, isDirectory: boolean): VaultEntry {
  return { name, path, isDirectory };
}

describe('VaultScanner hidden entries', () => {
  it('excludes dot-prefixed directories from the scan result', async () => {
    const fileSystem = new FakeFileSystem(
      new Map([
        [
          '/vault',
          [
            entry('.git', '/vault/.git', true),
            entry('.clutter', '/vault/.clutter', true),
            entry('Notes', '/vault/Notes', true),
          ],
        ],
        ['/vault/.git', []],
        ['/vault/.clutter', []],
        ['/vault/Notes', []],
      ]),
      new Map()
    );

    const scanner = new VaultScanner(fileSystem);
    const result = await scanner.scan('/vault');

    const scannedPaths = result.directories.map((directory) => directory.path);

    expect(scannedPaths).toContain('/vault');
    expect(scannedPaths).toContain('/vault/Notes');
    expect(scannedPaths).not.toContain('/vault/.git');
    expect(scannedPaths).not.toContain('/vault/.clutter');
  });

  it('excludes dot-prefixed markdown files from the scan result, checking name only', async () => {
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
      new Map([['/vault/Idea.md', '---\n---\ncontent']])
    );

    const scanner = new VaultScanner(fileSystem);
    const result = await scanner.scan('/vault');

    const scannedPaths = result.pages.map((page) => page.path);

    expect(scannedPaths).toContain('/vault/Idea.md');
    expect(scannedPaths).not.toContain('/vault/.archive.md');
  });

  it('still reads .folder.md as folder frontmatter rather than treating it as hidden content', async () => {
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

  it('does not descend into a hidden directory, even if it contains further content', async () => {
    const fileSystem = new FakeFileSystem(
      new Map([
        ['/vault', [entry('.obsidian', '/vault/.obsidian', true)]],
        [
          '/vault/.obsidian',
          [entry('workspace.json', '/vault/.obsidian/workspace.json', false)],
        ],
      ]),
      new Map()
    );

    const scanner = new VaultScanner(fileSystem);
    const result = await scanner.scan('/vault');

    expect(result.directories.map((d) => d.path)).toEqual(['/vault']);
    expect(result.pages).toHaveLength(0);
  });
});
