import { FrontmatterParser } from './FrontmatterParser';
import type { VaultFileSystem } from '../providers';
import type { ScannedPage } from '../discover';

export class DocumentLoader {
  private readonly frontmatterParser = new FrontmatterParser();

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
      frontmatterAnalysis: parsedMarkdown.frontmatterAnalysis,
      content: parsedMarkdown.body,
      analysis: parsedMarkdown.analysis,
    };
  }
}
