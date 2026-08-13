import type { ReactNode } from 'react';
import { PageBody } from './Page.Body';

export interface MarkdownBodyProps {
  children: ReactNode;
}

export function MarkdownBody({ children }: MarkdownBodyProps) {
  return <PageBody className="markdown__editor">{children}</PageBody>;
}
