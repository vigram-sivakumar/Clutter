import { FrontmatterParser } from '../parsers';
import { MarkdownAnalyzer } from './document-analysis/MarkdownAnalyzer';
import type { VaultFileSystem } from '../providers';
import type { ScannedPage } from './VaultScanResult';

export class DocumentLoader {
  private readonly frontmatterParser = new FrontmatterParser();
  private readonly markdownAnalyzer = new MarkdownAnalyzer();

  constructor(private readonly fileSystem: VaultFileSystem) {}

  async load(path: string): Promise<ScannedPage | null> {
    if (!path.endsWith('.md')) {
      return null;
    }

    const content = await this.fileSystem.readFile(path);

    const parsedMarkdown = this.frontmatterParser.parse(content);

    if (!parsedMarkdown) {
      return null;
    }

    return {
      path,
      directoryPath: '',
      frontmatter: parsedMarkdown.frontmatter,
      content: parsedMarkdown.body,
      analysis: this.markdownAnalyzer.analyze(parsedMarkdown.body),
    };
  }
}
