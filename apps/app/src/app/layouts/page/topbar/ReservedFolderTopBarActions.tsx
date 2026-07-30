import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

export function ReservedFolderTopBarActions() {
  return (
    <Button size="medium" isIconOnly>
      <AppIcon icon={'widthFill'} />
    </Button>
  );
}
