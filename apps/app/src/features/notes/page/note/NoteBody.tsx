import { PageBody } from '@app/layouts/page/body/Page.Body';

export interface NoteBodyProps {
  markdown: string;
}

export function NoteBody({ markdown }: NoteBodyProps) {
  return <PageBody>{markdown}</PageBody>;
}
