import type { ParsedFrontmatter } from '@core/vault/understand/FrontmatterParser';
import { AliasExtractor } from '../extractors/AliasExtractor';
import type { ScannedAlias } from '../extractors/AliasExtractor';

export interface FrontmatterAnalysis {
  readonly aliases: readonly ScannedAlias[];
}

export class FrontmatterAnalyzer {
  private readonly aliasExtractor = new AliasExtractor();

  analyze(frontmatter: ParsedFrontmatter): FrontmatterAnalysis {
    return {
      aliases: this.aliasExtractor.extract(frontmatter),
    };
  }
}
