import { PageBody } from '@app/layouts/page/body/Page.Body';

export interface DailyNoteBodyProps {
  markdown: string;
}

export function DailyNoteBody({ markdown }: DailyNoteBodyProps) {
  return <PageBody>{markdown}</PageBody>;
}
