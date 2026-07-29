import type { ReactNode } from 'react';

export interface PageLayout {
  readonly topBar: ReactNode;
  readonly body: ReactNode;

  readonly header?: ReactNode;
  readonly tabs?: ReactNode;
  readonly references?: ReactNode;
  readonly coverImage?: string;
}
