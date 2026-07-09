import { TopBar } from '@app/layouts/page/topbar/TopBar';
import { Button } from '@components/button/Button';
import { Breadcrumbs } from '../../../components/breadcrumb/Breadcrumbs';
// Mock
import { breadcrumbs as breadcrumbsMock } from '../mock/Breadcrumbs';
import { AppIcon } from '@shared/icon';

export function NoteTopBar() {
  return (
    <TopBar
      leading={
        <>
          <Breadcrumbs items={breadcrumbsMock} />
        </>
      }
      trailing={
        <>
          <Button size="medium" isIconOnly>
            <AppIcon icon={'favouriteOutline'} />
          </Button>
          <Button size="medium" isIconOnly>
            <AppIcon icon={'widthFill'} />
          </Button>
          <Button size="medium" isIconOnly>
            <AppIcon icon={'moreHorizontal'} />
          </Button>
        </>
      }
    />
  );
}
