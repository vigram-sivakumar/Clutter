import type { FrontmatterAnalysis } from './analysis';
import type { FolderFrontmatter } from './frontmatter';
import type { PageFrontmatter } from './frontmatter';
import type { ScannedPageAnalysis } from './analysis';
import type { SupportedResourceKind } from './SupportedResourceKind';

export interface VaultScanResult {
  readonly rootPath: string;
  readonly directories: ScannedDirectory[];
  readonly pages: ScannedPage[];
  /**
   * Non-Markdown files discovered during the scan that match a supported
   * resource kind (currently PDF/image). Not yet consumed by VaultBuilder
   * or surfaced anywhere downstream — this field exists so the scanner
   * stops discarding these files at the discovery boundary; turning them
   * into a domain-model concept and displaying them is a later step.
   */
  readonly files: ScannedResourceFile[];
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

export interface ScannedResourceFile {
  readonly path: string;
  readonly directoryPath: string;
  readonly kind: SupportedResourceKind;
}
