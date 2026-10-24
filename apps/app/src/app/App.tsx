import { AppShell } from './AppShell';
import { ToastProvider } from '../components/toast/ToastProvider';
import { useTheme } from '../design-system/useTheme';

export function App() {
  useTheme(); // registers system preference listener + keeps data-theme in sync
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
