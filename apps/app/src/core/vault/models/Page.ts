import type { PageMetadata } from './PageMetadata';

export type PageType = 'note' | 'daily-note';

export interface Page {
  readonly id: string;
  readonly type: PageType;

  readonly name: string;
  readonly path: string;
  readonly parentId: string | null;

  readonly metadata: PageMetadata;
}
