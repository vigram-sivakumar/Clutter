import { PageTitle } from '@app/layouts/page/header/Page.Title';
import { EditableText } from '@components/editable-text/EditableText';

/**
 * Layer-2 composition component for editable note page titles.
 *
 * Composes `PageTitle` and `EditableText` for displaying and editing note titles.
 * Contains no business logic; delegates committed title changes to the parent through `onCommit`.
 * Should remain reusable for any page type whose title is editable using the same interaction.
 */
export interface NotePageTitleProps {
  title: string;
  onCommit(title: string): void;
}

export function NotePageTitle({ title, onCommit }: NotePageTitleProps) {
  return (
    <PageTitle>
      <EditableText
        value={title}
        placeholder="Untitled Note"
        onCommit={onCommit}
      />
    </PageTitle>
  );
}
