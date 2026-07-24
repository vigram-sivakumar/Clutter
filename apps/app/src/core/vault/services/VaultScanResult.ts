import type { FolderFrontmatter } from '../models';
import type { PageFrontmatter } from '../models';

export interface VaultScanResult {
  readonly rootPath: string;
  readonly directories: ScannedDirectory[];
  readonly pages: ScannedPage[];
}

export interface ScannedDirectory {
  readonly path: string;
  readonly parentPath: string | null;
  readonly frontmatter: FolderFrontmatter | null;
}

export interface ScannedPage {
  readonly path: string;
  readonly directoryPath: string;
  readonly frontmatter: PageFrontmatter;
  readonly content: string;
}
