import { Dialog } from '@components/dialog/Dialog';
import { NewFolderContent, type NewFolderContentProps } from './NewFolderContent';

interface NewFolderDialogProps
  extends Pick<
    NewFolderContentProps,
    'canCreate' | 'onSubmit' | 'labels' | 'initialName' | 'initialDescription' | 'initialIcon' | 'withDescription' | 'withIcon' | 'withCancel'
  > {
  readonly open: boolean;
  readonly onClose: () => void;
}

/**
 * The shared name + description modal for all standalone New folder entry points, and, configured
 * with its own `labels`, "Create template". One modal, one layout; callers supply wording and prefilled values.
 */
export function NewFolderDialog({ open, onClose, ...content }: NewFolderDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} size="large" top={240} scrim="strong">
      <NewFolderContent onClose={onClose} {...content} />
    </Dialog>
  );
}
