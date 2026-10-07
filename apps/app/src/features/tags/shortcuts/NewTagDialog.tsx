import { Dialog } from '@components/dialog/Dialog';
import { NewTagContent, type NewTagContentProps } from './NewTagContent';

interface NewTagDialogProps extends Pick<NewTagContentProps, 'validateName' | 'onSubmit'> {
  readonly open: boolean;
  readonly onClose: () => void;
}

/** The one New tag modal — opened from the Tags sidebar's New row. */
export function NewTagDialog({ open, onClose, validateName, onSubmit }: NewTagDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} size="large" top={240} scrim="strong" dismissible={false}>
      <NewTagContent onClose={onClose} validateName={validateName} onSubmit={onSubmit} />
    </Dialog>
  );
}
