import { Dialog } from '@components/dialog/Dialog';
import { NewFolderContent, type NewFolderContentProps } from './NewFolderContent';

interface NewFolderDialogProps extends Pick<NewFolderContentProps, 'canCreate' | 'onSubmit'> {
  readonly open: boolean;
  readonly onClose: () => void;
}

/** The New folder modal for the sidebar top controls — a global entry point, so there is no Notes-panel inline row to use. */
export function NewFolderDialog({ open, onClose, canCreate, onSubmit }: NewFolderDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} size="large" top={240} scrim="strong" dismissible={false}>
      <NewFolderContent onClose={onClose} canCreate={canCreate} onSubmit={onSubmit} />
    </Dialog>
  );
}
