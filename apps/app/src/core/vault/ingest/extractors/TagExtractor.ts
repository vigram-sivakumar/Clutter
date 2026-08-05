export interface ScannedTagOccurrence {
  // Exactly as typed in Markdown — never rewritten or case-normalized.
  // normalizeTagName() exists for comparison (dedup, metadata lookup,
  // future autocomplete matching), not for deciding what gets stored.
  readonly name: string;
}

export class TagExtractor {
  extract(content: string): readonly ScannedTagOccurrence[] {
    const tags: ScannedTagOccurrence[] = [];

    for (const line of content.split('\n')) {
      tags.push(...this.extractFromLine(line));
    }

    return tags;
  }

  private extractFromLine(line: string): ScannedTagOccurrence[] {
    const tags: ScannedTagOccurrence[] = [];

    const matches = line.matchAll(/(^|\s)#([a-zA-Z0-9_-]+)/g);

    for (const match of matches) {
      const name = match[2];

      if (!name) {
        continue;
      }

      tags.push({
        name,
      });
    }

    return tags;
  }
}
