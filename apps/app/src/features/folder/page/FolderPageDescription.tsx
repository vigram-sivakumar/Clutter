import { PageDescription } from '@app/layouts/page/header/Page.Description';
import { EditableText } from '@components/editable-text/EditableText';

export interface FolderPageDescriptionProps {
  description: string;
  onCommit(description: string): void;
}

export function FolderPageDescription({
  description,
  onCommit,
}: FolderPageDescriptionProps) {
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
