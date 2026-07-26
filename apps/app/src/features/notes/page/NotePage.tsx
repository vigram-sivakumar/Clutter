import { EditableText } from '@components/editable-text/EditableText';
import { PageDescription } from '@app/layouts/page/header/PageDescription';
import { PageTitle } from '@app/layouts/page/header/PageTitle';
import { PageTitleSection } from '@app/layouts/page/header/PageTitleSection';

import { NoteTopBar } from '@features/notes/page/TopBar';

import { Page } from '../../../app/layouts/page/Page';

export function NotePage() {
  return (
    <Page
      topBar={<NoteTopBar />}
      coverImage="https://images.unsplash.com/flagged/photo-1572392640988-ba48d1a74457?q=80&w=1528&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
      header={
        <PageTitleSection>
          <PageTitle>
            <EditableText
              value=""
              placeholder="Untitled Note"
              onCommit={() => {}}
            />
          </PageTitle>

          <PageDescription>
            <EditableText
              value=""
              placeholder="Add a description..."
              onCommit={() => {}}
            />
          </PageDescription>
        </PageTitleSection>
      }
      body={'Markdown goes here...'}
    />
  );
}
