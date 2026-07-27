import { IdGenerator } from '../../shared/identity/IdGenerator';
import { PageFactory } from './PageFactory';
import type { PageFrontmatter } from '../../vault/understand/frontmatter/PageFrontmatter';

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
    const id = this.idGenerator.generate();
    const now = new Date().toISOString();

    const content = this.pageFactory.create(
      {
        id,
        type,
        created: now,
        modified: now,
      },
      body
    );

    return {
      id,
      content,
    };
  }
}
