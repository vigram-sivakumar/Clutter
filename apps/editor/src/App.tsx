import { AppLayout } from './components/layouts/AppLayout';
import { useTheme } from './design-system/useTheme';
import { PageLayout } from './components/layouts/PageLayout';
import { Button } from './components/NewButton';
import { CustomIcons } from './design-system/icons';

export function App() {
  useTheme(); // registers system preference listener + keeps data-theme in sync
  return (
    <AppLayout
      page={
        <PageLayout>
          <Button variant="filled">Filled</Button>
          <Button variant="outlined">Outlined</Button>
          <Button variant="outline-fill">Outlined</Button>

          <Button variant="ghost">Ghost</Button>

          <Button
            variant="outlined"
            isIconOnly
            startSlot={<CustomIcons.Plus />}
          >
            Icon
          </Button>
          <Button
            variant="filled"
            startSlot={<CustomIcons.Plus />}
            endSlot={<CustomIcons.Note />}
          >
            Add Note
          </Button>
        </PageLayout>
      }
    />
  );
}
