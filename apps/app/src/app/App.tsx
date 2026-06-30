import { AppLayout } from './components/layouts/AppLayout';
import { useTheme } from './design-system/useTheme';

export function App() {
  useTheme(); // registers system preference listener + keeps data-theme in sync
  return <AppLayout />;
}
