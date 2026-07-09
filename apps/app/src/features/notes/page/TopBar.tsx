import { TopBar } from '@app/layouts/page/topbar/TopBar';
import { Button } from '@components/button/Button';
import { Icons } from '@design-system/icons';
import { Breadcrumbs } from '../../../components/breadcrumb/Breadcrumbs';
// Mock
import { breadcrumbs as breadcrumbsMock } from '../mock/Breadcrumbs';

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
            {<Icons.FavouriteOutline />}
          </Button>
          <Button size="medium" isIconOnly>
            {<Icons.WidthFill />}
          </Button>
          <Button size="medium" isIconOnly>
            {<Icons.MoreHorizontal />}
          </Button>
        </>
      }
    />
  );
}
