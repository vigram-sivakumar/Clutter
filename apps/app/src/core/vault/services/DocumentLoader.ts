import type { ParsedMarkdown } from '../parsers';
import { FrontmatterParser } from '../parsers';
import type { VaultFileSystem } from '../providers';

export class DocumentLoader {
  private readonly frontmatterParser = new FrontmatterParser();

  constructor(private readonly fileSystem: VaultFileSystem) {}

  async load(path: string): Promise<ParsedMarkdown | null> {
    if (!path.endsWith('.md')) {
      return null;
    }

    const content = await this.fileSystem.readFile(path);

    return this.frontmatterParser.parse(content);
  }
}
