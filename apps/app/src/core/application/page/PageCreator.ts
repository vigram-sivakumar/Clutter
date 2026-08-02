import { IdGenerator } from '../../shared/identity/IdGenerator';
import { PageFactory } from './PageFactory';
import type { PageFrontmatter } from '../../vault/ingest/frontmatter/PageFrontmatter';

export interface CreatedPage {
  id: string;
  content: string;
}

export class PageCreator {
  public constructor(
    private readonly idGenerator: IdGenerator,
    private readonly pageFactory: PageFactory
  ) {}

  public create(type: PageFrontmatter['type'], body = ''): CreatedPage {
    const id = this.generateId();

    return {
      id,
      content: this.buildContent(id, type, body),
    };
  }

  /**
   * Mints an id without building content — for a draft (ADR-017), the id
   * is needed at open time, before there is any content to build a
   * document from yet.
   */
  public generateId(): string {
    return this.idGenerator.generate();
  }

  /**
   * Builds a document for an already-known id — the other half of
   * create()'s split, reused when a draft (ADR-017) is persisted for the
   * first time and must keep the id it was opened with rather than
   * minting a new one.
   */
  public buildContent(
    id: string,
    type: PageFrontmatter['type'],
    body = ''
  ): string {
    const now = new Date().toISOString();

    return this.pageFactory.create(
      {
        id,
        type,
        created: now,
        modified: now,
      },
      body
    );
  }
}
