import type { FrontmatterAnalysis } from './analysis';
import type { FolderFrontmatter } from './frontmatter';
import type { PageFrontmatter } from './frontmatter';
import type { ScannedPageAnalysis } from './analysis';

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
  readonly frontmatterAnalysis: FrontmatterAnalysis;
  readonly content: string;
  readonly analysis: ScannedPageAnalysis;
}
