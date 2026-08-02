import { IdGenerator } from '../../shared/identity/IdGenerator';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';

export interface CreatedFolder {
  readonly id: string;
  readonly content: string;
}

/**
 * Mints an id and builds the .folder.md content for a newly created folder
 * — the persisted-identity half of folder creation (see ADR-017 §9's named
 * follow-up: a folder created by Clutter must never depend on path-derived
 * identity).
 *
 * Pure, mirroring PageCreator: no filesystem or Vault access. A created
 * folder needs only a persisted id in its frontmatter — every other
 * FolderFrontmatter field is optional and already defaults correctly
 * (FolderBuilder) when absent.
 */
export class FolderCreator {
  private readonly serializer = new FrontmatterSerializer();

  public constructor(private readonly idGenerator: IdGenerator) {}

  public generateId(): string {
    return this.idGenerator.generate();
  }

  public buildContent(id: string): string {
    return `${this.serializer.serialize({ id })}\n`;
  }
}
