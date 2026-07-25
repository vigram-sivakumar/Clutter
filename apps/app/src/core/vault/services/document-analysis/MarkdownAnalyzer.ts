import type { DocumentAnalysis } from './DocumentAnalysis';
import { TagExtractor } from './extractors/TagExtractor';
import { TaskExtractor } from './extractors/TaskExtractor';
import { LinkExtractor } from './extractors/LinkExtractor';
import { EmbedExtractor } from './extractors/EmbedExtractor';
import { HeadingExtractor } from './extractors/HeadingExtractor';
import { BlockReferenceExtractor } from './extractors/BlockReferenceExtractor';

export class MarkdownAnalyzer {
  private readonly tagExtractor = new TagExtractor();
  private readonly taskExtractor = new TaskExtractor();
  private readonly linkExtractor = new LinkExtractor();
  private readonly embedExtractor = new EmbedExtractor();
  private readonly headingExtractor = new HeadingExtractor();
  private readonly blockReferenceExtractor = new BlockReferenceExtractor();

  analyze(content: string): DocumentAnalysis {
    return {
      tasks: this.taskExtractor.extract(content),
      tags: this.tagExtractor.extract(content),
      links: this.linkExtractor.extract(content),
      embeds: this.embedExtractor.extract(content),
      headings: this.headingExtractor.extract(content),
      blockReferences: this.blockReferenceExtractor.extract(content),
    };
  }
}
