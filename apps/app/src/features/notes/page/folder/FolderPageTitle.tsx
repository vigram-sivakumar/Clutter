import { PageTitle } from '@app/layouts/page/header/Page.Title';

export interface FolderPageTitleProps {
  title: string;
}

export function FolderPageTitle({ title }: FolderPageTitleProps) {
  return <PageTitle>{title}</PageTitle>;
}
