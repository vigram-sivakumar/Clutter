import { EditableText } from '@components/editable-text/EditableText';
import { PageDescription } from '@app/layouts/page/header/Page.Description';

export interface NotePageDescriptionProps {
  description: string;
  onCommit(description: string): void;
}

export function NotePageDescription({
  description,
  onCommit,
}: NotePageDescriptionProps) {
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
