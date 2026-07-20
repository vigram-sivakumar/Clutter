import { EditableText } from '@components/editable-text/EditableText';
import { PageDescription } from '@components/page-title/PageDescription';
import { PageTitle } from '@components/page-title/PageTitle';
import { PageTitleSection } from '@components/page-title/PageTitleSection';

import { NoteTopBar } from '@features/notes/page/TopBar';

import { Page } from './Page';

export function MockPage() {
  return (
    <Page
      topBar={<NoteTopBar />}
      coverImage="https://images.unsplash.com/flagged/photo-1572392640988-ba48d1a74457?q=80&w=1528&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
      header={
        <PageTitleSection>
          <PageTitle>
            <EditableText
              value="Untitled"
              placeholder="Untitled"
              onCommit={() => {}}
            />
          </PageTitle>

          <PageDescription>
            <EditableText
              value="This is a new note with default title"
              placeholder="Add a description..."
              onCommit={() => {}}
            />
          </PageDescription>
        </PageTitleSection>
      }
    />
  );
}
