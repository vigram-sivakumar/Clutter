import { IdGenerator } from '../../shared/identity/IdGenerator';
import { PageFactory } from './PageFactory';
import type { PageFrontmatter } from '../../vault/ingest/frontmatter/PageFrontmatter';

export class PageCreator {
  public constructor(
    private readonly idGenerator: IdGenerator,
    private readonly pageFactory: PageFactory
  ) {}

  /**
   * Mints an id without building content — for a draft (ADR-017), the id
   * is needed at open time, before there is any content to build a
   * document from yet.
   */
  public generateId(): string {
    return this.idGenerator.generate();
  }

  /**
   * Builds a document for an already-known id — paired with generateId()
   * because every caller needs the id before content can be built (ADR-017:
   * a draft is opened, and shown, with its id well before it has any
   * content), and reused when a draft is persisted for the first time and
   * must keep the id it was opened with rather than minting a new one.
   *
   * `metadata` carries a draft's editable-metadata patch (description,
   * icon, cover, favorite) when the first persistent change that promotes
   * the draft was a metadata edit rather than a title/body one — kept
   * typed purely in terms of PageFrontmatter (already this class's
   * vocabulary) rather than importing PageOperations' EditablePageMetadata,
   * so this stays a self-contained builder, not coupled back to its own
   * caller's type.
   */
  public buildContent(
    id: string,
    type: PageFrontmatter['type'],
    body = '',
    metadata?: Partial<
      Pick<PageFrontmatter, 'description' | 'icon' | 'cover' | 'favorite'>
    >
  ): string {
    const now = new Date().toISOString();

    return this.pageFactory.create(
      {
        id,
        type,
        created: now,
        modified: now,
        ...metadata,
      },
      body
    );
  }
}
