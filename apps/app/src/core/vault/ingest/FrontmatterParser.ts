import type { PageFrontmatter } from './frontmatter';
import type { ScannedPageAnalysis } from './analysis';
import { MarkdownAnalyzer } from './analysis';
import { FrontmatterAnalyzer, type FrontmatterAnalysis } from './analysis';
import { parseFlowSequence, unquoteFrontmatterString } from './frontmatter/frontmatterStringValue';
import { OWNED_FRONTMATTER_KEYS } from './frontmatter/ownedFrontmatterKeys';

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

    // Raw lines of keys Clutter doesn't own, kept verbatim (a key line plus
    // its indented/list continuation lines). `pendingBlankLines` holds
    // blank lines seen inside such a block, flushed only if the block
    // continues, so trailing blanks never accumulate.
    const unownedLines: string[] = [];
    let capturingUnowned = false;
    let pendingBlankLines: string[] = [];

    for (const line of frontmatterText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (capturingUnowned) pendingBlankLines.push(line);
        continue;
      }

      const isListItem = trimmed.startsWith('- ');
      const isContinuation =
        capturingUnowned && (isListItem || /^\s/.test(line));

      if (isContinuation) {
        unownedLines.push(...pendingBlankLines, line);
        pendingBlankLines = [];
      } else {
        capturingUnowned = false;
        pendingBlankLines = [];
      }

      if (isListItem) {
        if (currentArrayKey === 'aliases') {
          this.addAliases(frontmatter, [trimmed.slice(2)]);
        } else if (currentArrayKey === 'tags') {
          const tags = frontmatter.tags ?? [];
          tags.push(trimmed.slice(2).trim());
          frontmatter.tags = tags;
        }
        continue;
      }

      // Indented line inside an unowned block that isn't a list item
      // (e.g. a nested mapping): raw-captured above, never interpreted as
      // one of Clutter's own keys.
      if (isContinuation) continue;

      const sepIdx = trimmed.indexOf(':');
      if (sepIdx === -1) continue;

      const key = trimmed.slice(0, sepIdx).trim();
      const value = trimmed.slice(sepIdx + 1).trim();

      if (!OWNED_FRONTMATTER_KEYS.has(key)) {
        unownedLines.push(line);
        capturingUnowned = true;
      }
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
        case 'coverHidden':
          if (typeof scalar === 'boolean') {
            frontmatter.coverHidden = scalar;
          }
          break;
        case 'coverLayout':
          if (scalar === 'side' || scalar === 'above') {
            frontmatter.coverLayout = scalar;
          }
          break;
        case 'coverPositionAbove': {
          const position = this.parseNormalizedPosition(value);
          if (position !== undefined) {
            frontmatter.coverPositionAbove = position;
          }
          break;
        }
        case 'coverPositionSide': {
          const position = this.parseNormalizedPosition(value);
          if (position !== undefined) {
            frontmatter.coverPositionSide = position;
          }
          break;
        }
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
          // Block list (`aliases:` then `  - value` lines, handled above),
          // one-line flow list (`aliases: [a, "b"]`), or a single value
          // (`aliases: a`) — every form other tools write.
          if (!frontmatter.aliases) {
            frontmatter.aliases = [];
          }
          if (value !== '') {
            this.addAliases(frontmatter, parseFlowSequence(value) ?? [value]);
          }
          break;
        case 'tags':
          if (!frontmatter.tags) {
            frontmatter.tags = [];
          }
          break;
      }
    }

    if (unownedLines.length > 0) {
      frontmatter.unownedLines = unownedLines;
    }

    return frontmatter;
  }
  /** Appends raw alias values, unquoted and trimmed; empty values are skipped. */
  private addAliases(frontmatter: PageFrontmatter, rawValues: readonly string[]): void {
    const aliases = frontmatter.aliases ?? [];

    for (const raw of rawValues) {
      const alias = unquoteFrontmatterString(raw).trim();
      if (alias.length > 0) {
        aliases.push(alias);
      }
    }

    frontmatter.aliases = aliases;
  }

  // Out-of-range or non-numeric values are ignored (field stays unset, so
  // resolvePageMetadata/FolderBuilder default it to 50) rather than clamped
  // or rejecting the whole file — mirrors coverLayout's own
  // ignore-if-not-a-recognized-value handling above, and matches the
  // "Values outside 0-100 must not be persisted" requirement without this
  // hand-written parser needing a throw/error-reporting path it has
  // nowhere else.
  private parseNormalizedPosition(value: string): number | undefined {
    if (value === '') {
      return undefined;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      return undefined;
    }
    return parsed;
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
