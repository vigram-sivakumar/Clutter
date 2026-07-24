import type { DocumentAnalysis } from './DocumentAnalysis';
import { TagExtractor } from './extractors/TagExtractor';
import { TaskExtractor } from './extractors/TaskExtractor';

export class MarkdownAnalyzer {
  private readonly tagExtractor = new TagExtractor();
  private readonly taskExtractor = new TaskExtractor();

  analyze(content: string): DocumentAnalysis {
    return {
      tasks: this.taskExtractor.extract(content),
      tags: this.tagExtractor.extract(content),
    };
  }
}
