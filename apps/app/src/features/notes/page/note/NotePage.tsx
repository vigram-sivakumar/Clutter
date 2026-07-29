import { Page } from '@app/layouts/page/Page';

import { PageTitleSection } from '@app/layouts/page/header/Page.TitleSection';
import { NoteTopBar } from './NoteTopBar';
import { NotePageTitle } from './NotePageTitle';
import { NotePageDescription } from './NotePageDescription';
import { NoteBody } from './NoteBody';
import type { NotePageModel } from './NotePageModel';

export interface NotePageProps {
  readonly model: NotePageModel;
  readonly onArchive?: () => void;
}

export function NotePage({ model, onArchive }: NotePageProps) {
  const handleCommit = (markdown: string): void => {
    model.updateMarkdown(markdown);
  };
  return (
    <Page
      topBar={
        <NoteTopBar breadcrumbs={model.breadcrumbs} onArchive={onArchive} />
      }
      coverImage={model.coverImage ?? undefined}
      header={
        <PageTitleSection>
          <NotePageTitle title={model.title} onCommit={model.rename} />
          <NotePageDescription
            description={model.description}
            onCommit={model.updateDescription}
          />
        </PageTitleSection>
      }
      body={<NoteBody markdown={model.markdown} onCommit={handleCommit} />}
    />
  );
}
