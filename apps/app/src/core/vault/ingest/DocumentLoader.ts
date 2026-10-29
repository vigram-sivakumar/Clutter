import { FrontmatterParser } from './FrontmatterParser';
import { fingerprint } from '../../shared/identity/textFingerprint';
import type { VaultFileSystem } from '../providers';
import type { ScannedPage } from './VaultScanResult';
import type { ParseMemo } from './ParseMemo';

export class DocumentLoader {
  private readonly frontmatterParser = new FrontmatterParser();

  constructor(
    private readonly fileSystem: VaultFileSystem,
    private readonly memo: ParseMemo | null = null
  ) {}

  async load(path: string): Promise<ScannedPage | null> {
    if (!path.endsWith('.md')) {
      return null;
    }

    const content = await this.fileSystem.readFile(path);

    const parsedMarkdown = await this.parse(content);

    if (!parsedMarkdown) {
      return null;
    }

    return {
      path,
      directoryPath: '',
      frontmatter: parsedMarkdown.frontmatter,
      frontmatterAnalysis: parsedMarkdown.frontmatterAnalysis,
      content: parsedMarkdown.body,
      analysis: parsedMarkdown.analysis,
      sourceFingerprint: fingerprint(content),
    };
  }
  /**
   * `FrontmatterParser.parse`, through the memo when there is one. A hit
   * supplies the expensive parts for text identical to what was parsed before
   * and the body is derived by the parser's own `split`, so the result is
   * structurally identical to a fresh parse (ADR-053).
   */
  private async parse(content: string) {
    const key = this.memo ? await this.memo.keyOf(content) : null;
    if (this.memo && key !== null) {
      const recalled = this.memo.recall(key);
      if (recalled) {
        return {
          ...recalled,
          body: this.frontmatterParser.split(content).body,
        };
      }
    }
    const parsed = this.frontmatterParser.parse(content);
    if (this.memo && key !== null) {
      const { body: _body, ...parts } = parsed;
      this.memo.remember(key, parts);
    }
    return parsed;
  }
}
