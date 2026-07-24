import type { Page } from '../models';
import type { ScannedPage } from './VaultScanResult';
import { IdentityResolver } from './IdentityResolver';

export interface BuildPageInput {
  readonly parentId: string;
  readonly page: ScannedPage;
}

export class PageBuilder {
  private readonly identityResolver = new IdentityResolver();

  private getPageName(path: string): string {
    const fileName = path.substring(path.lastIndexOf('/') + 1);
    return fileName.endsWith('.md')
      ? fileName.substring(0, fileName.length - 3)
      : fileName;
  }

  build(input: BuildPageInput): Page {
    const { page, parentId } = input;

    const identity = this.identityResolver.resolve(
      page.frontmatter.id,
      page.path
    );

    const type = page.frontmatter.type;

    return {
      id: identity.id,
      type: type ?? 'note',
      name: this.getPageName(page.path),
      path: page.path,
      parentId,

      metadata: {
        icon: page.frontmatter.icon ?? null,
        cover: page.frontmatter.cover ?? null,
        description: page.frontmatter.description ?? null,
        favorite: page.frontmatter.favorite ?? false,
        originalParentId: page.frontmatter.originalParentId ?? null,
        createdAt: page.frontmatter.createdAt ?? null,
        updatedAt: page.frontmatter.updatedAt ?? null,
      },
    };
  }
}
