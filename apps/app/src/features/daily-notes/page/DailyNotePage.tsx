import { Page } from '../../../app/layouts/page/Page';
import { PageTitleSection } from '@app/layouts/page/header/Page.TitleSection';
import type { DailyNotePageModel } from './DailyNotePageModel';

import { DailyNoteTopBar } from './DailyNoteTopBar';
import { DailyNotePageTitle } from './DailyNotePageTitle';
import { DailyNotePageDescription } from './DailyNotePageDescription';
import { DailyNoteBody } from './DailyNoteBody';

export interface DailyNotePageProps {
  model: DailyNotePageModel;
}

export function DailyNotePage({ model }: DailyNotePageProps) {
  return (
    <Page
      topBar={<DailyNoteTopBar breadcrumbs={model.breadcrumbs} />}
      coverImage={model.coverImage ?? undefined}
      header={
        <PageTitleSection>
          <DailyNotePageTitle title={model.title} />
          <DailyNotePageDescription
            description={model.description}
            onCommit={model.updateDescription}
          />
        </PageTitleSection>
      }
      body={<DailyNoteBody markdown={model.markdown} />}
    />
  );
}
