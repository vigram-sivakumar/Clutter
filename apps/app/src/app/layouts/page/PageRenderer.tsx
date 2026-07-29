import { Page } from './Page';
import type { PageLayout } from './PageLayout';

export interface PageRendererProps {
  readonly layout: PageLayout;
}

export function PageRenderer({ layout }: PageRendererProps) {
  return (
    <Page
      topBar={layout.topBar}
      header={layout.header}
      body={layout.body}
      tabs={layout.tabs}
      references={layout.references}
      coverImage={layout.coverImage}
    />
  );
}
