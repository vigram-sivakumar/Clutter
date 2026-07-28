import { PageTitle } from '@app/layouts/page/header/Page.Title';

export interface DailyNotePageTitleProps {
  title: string;
}

export function DailyNotePageTitle({ title }: DailyNotePageTitleProps) {
  return (
    <PageTitle>
      <span>{title}</span>
    </PageTitle>
  );
}
