export interface ScannedBlockReference {
  readonly id: string;
}

export class BlockReferenceExtractor {
  private static readonly BLOCK_REFERENCE_REGEX = /^\^([A-Za-z0-9_-]+)$/gm;

  // TODO(v2): Associate block references with their owning Markdown block
  // and source position. For now we only extract explicit block IDs.
  extract(markdown: string): readonly ScannedBlockReference[] {
    const blockReferences: ScannedBlockReference[] = [];

    for (const match of markdown.matchAll(
      BlockReferenceExtractor.BLOCK_REFERENCE_REGEX
    )) {
      const id = match[1];

      if (!id) {
        continue;
      }

      blockReferences.push({ id });
    }

    return blockReferences;
  }
}
