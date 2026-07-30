import { FolderTopBar } from './FolderTopBar';
import type { FolderPageModel } from './FolderPageModel';
import { FolderBody } from './FolderBody';
import { Page } from '@app/layouts/page/Page';
import { PageTitleSection } from '@app/layouts/page/header/Page.TitleSection';
import { FolderPageTitle } from './FolderPageTitle';
import { FolderPageDescription } from './FolderPageDescription';

interface FolderPageProps {
  readonly model: FolderPageModel;
}

export function FolderPage({ model }: FolderPageProps) {
  const handleDescriptionCommit = (description: string): void => {
    void description;
    throw new Error('Not implemented');
  };

  return (
    <Page
      topBar={<FolderTopBar breadcrumbs={model.breadcrumbs} />}
      header={
        <PageTitleSection>
          <FolderPageTitle title={model.title} />
          <FolderPageDescription
            description={model.description}
            onCommit={handleDescriptionCommit}
          />
        </PageTitleSection>
      }
      body={<FolderBody children={model.children} />}
      references={null}
    />
  );
}
