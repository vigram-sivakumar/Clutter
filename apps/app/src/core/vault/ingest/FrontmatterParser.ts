import type { PageFrontmatter } from './frontmatter';
import type { ScannedPageAnalysis } from './analysis';
import { MarkdownAnalyzer } from './analysis';
import { FrontmatterAnalyzer, type FrontmatterAnalysis } from './analysis';

export type ParsedFrontmatter = Record<string, unknown>;

export interface ParsedMarkdown {
  frontmatter: ParsedFrontmatter & PageFrontmatter;
  frontmatterAnalysis: FrontmatterAnalysis;
  body: string;
  analysis: ScannedPageAnalysis;
}

export class FrontmatterParser {
  private readonly markdownAnalyzer = new MarkdownAnalyzer();
  private readonly frontmatterAnalyzer = new FrontmatterAnalyzer();

  parse(content: string): ParsedMarkdown {
    // 1. Check for opening delimiter
    if (!content.startsWith('---\n')) {
      return {
        frontmatter: {},
        frontmatterAnalysis: this.frontmatterAnalyzer.analyze({}),
        body: content,
        analysis: this.markdownAnalyzer.analyze(content),
      };
    }
    // 2. Find closing delimiter
    const endIdx = content.indexOf('\n---', 4);
    if (endIdx === -1) {
      return {
        frontmatter: {},
        frontmatterAnalysis: this.frontmatterAnalyzer.analyze({}),
        body: content,
        analysis: this.markdownAnalyzer.analyze(content),
      };
    }
    // 3. Extract frontmatter text
    const frontmatterText = content.slice(4, endIdx);
    // 4. Extract body, trimming a single leading newline if present
    let body = content.slice(endIdx + 4);
    if (body.startsWith('\n')) {
      body = body.slice(1);
    }
    const frontmatter = this.parseFrontmatter(frontmatterText);
    // 6. Return result
    const analysis = this.markdownAnalyzer.analyze(body);
    const frontmatterAnalysis = this.frontmatterAnalyzer.analyze(frontmatter);
    return {
      frontmatter,
      frontmatterAnalysis,
      body,
      analysis,
    };
  }

  // TODO: Introduce a matching FrontmatterSerializer so parsing and
  // serialization share a single canonical implementation.
  private parseFrontmatter(
    frontmatterText: string
  ): ParsedFrontmatter & PageFrontmatter {
    const frontmatter: ParsedFrontmatter & PageFrontmatter = {};

    let currentArrayKey: string | null = null;

    for (const line of frontmatterText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('- ')) {
        if (currentArrayKey === 'aliases') {
          const aliases = (frontmatter.aliases as string[] | undefined) ?? [];
          aliases.push(trimmed.slice(2).trim());
          frontmatter.aliases = aliases;
        }
        continue;
      }

      const sepIdx = trimmed.indexOf(':');
      if (sepIdx === -1) continue;

      const key = trimmed.slice(0, sepIdx).trim();
      const value = trimmed.slice(sepIdx + 1).trim();
      const scalar = this.parseScalar(value);

      currentArrayKey = value === '' ? key : null;

      switch (key) {
        case 'id':
          if (typeof scalar === 'string') {
            frontmatter.id = scalar;
          }
          break;
        case 'type':
          if (
            typeof scalar === 'string' &&
            (scalar === 'note' || scalar === 'daily-note')
          ) {
            frontmatter.type = scalar;
          }
          break;
        case 'icon':
          if (typeof scalar === 'string') {
            frontmatter.icon = scalar;
          }
          break;
        case 'cover':
          if (typeof scalar === 'string') {
            frontmatter.cover = scalar;
          }
          break;
        case 'description':
          if (typeof scalar === 'string') {
            frontmatter.description = scalar;
          }
          break;
        case 'favorite':
          if (typeof scalar === 'boolean') {
            frontmatter.favorite = scalar;
          }
          break;
        case 'status':
          if (
            typeof scalar === 'string' &&
            (scalar === 'active' || scalar === 'archived')
          ) {
            frontmatter.status = scalar;
          }
          break;
        case 'archivedAt':
          if (typeof scalar === 'string' || scalar === null) {
            frontmatter.archivedAt = scalar;
          }
          break;
        case 'originalParentId':
          if (typeof scalar === 'string' || scalar === null) {
            frontmatter.originalParentId = scalar;
          }
          break;
        case 'originalPath':
          if (typeof scalar === 'string' || scalar === null) {
            frontmatter.originalPath = scalar;
          }
          break;
        case 'created':
          if (typeof scalar === 'string') {
            frontmatter.created = scalar;
          }
          break;
        case 'modified':
          if (typeof scalar === 'string') {
            frontmatter.modified = scalar;
          }
          break;
        case 'aliases':
          if (!frontmatter.aliases) {
            frontmatter.aliases = [];
          }
          break;
      }
    }

    return frontmatter;
  }
  private parseScalar(value: string): string | boolean | null {
    switch (value) {
      case 'true':
        return true;
      case 'false':
        return false;
      case 'null':
        return null;
      default:
        return value;
    }
  }
}
