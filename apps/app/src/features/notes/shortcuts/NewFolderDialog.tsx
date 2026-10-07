import { Dialog } from '@components/dialog/Dialog';
import { NewFolderContent, type NewFolderContentProps } from './NewFolderContent';

interface NewFolderDialogProps
  extends Pick<
    NewFolderContentProps,
    'canCreate' | 'onSubmit' | 'labels' | 'initialName' | 'initialDescription' | 'withIcon' | 'withCancel'
  > {
  readonly open: boolean;
  readonly onClose: () => void;
}

/**
 * The name + description modal — "New folder" for the sidebar top controls (a global entry point, so
 * there is no Notes-panel inline row to use), and, configured with its own `labels`, "Create
 * template". One modal, one layout; callers supply wording and prefilled values.
 */
export function NewFolderDialog({ open, onClose, ...content }: NewFolderDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} size="large" top={240} scrim="strong" dismissible={false}>
      <NewFolderContent onClose={onClose} {...content} />
    </Dialog>
  );
}
