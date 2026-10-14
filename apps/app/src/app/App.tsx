import { AppShell } from './AppShell';
import { useTheme } from '../design-system/useTheme';

export function App() {
  useTheme(); // registers system preference listener + keeps data-theme in sync
  return <AppShell />;
}
