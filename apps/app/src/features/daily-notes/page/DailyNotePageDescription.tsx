import { EditableText } from '@components/editable-text/EditableText';
import { PageDescription } from '@app/layouts/page/header/Page.Description';
export interface DailyNotePageDescriptionProps {
  description: string;
  onCommit(description: string): void;
}

export function DailyNotePageDescription({
  description,
  onCommit,
}: DailyNotePageDescriptionProps) {
  return (
    <PageDescription>
      <EditableText
        value={description}
        placeholder="Add a description"
        onCommit={onCommit}
      />
    </PageDescription>
  );
}
