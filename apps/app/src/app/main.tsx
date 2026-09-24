/**
 * Entry point for Engine Demo
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isTauri } from '@tauri-apps/api/core';
import { App } from './App';
import { installResizeDiagnostics } from './devResizeDiagnostics';

import '../design-system/tokens.css';
import '../design-system/theme.css';
import '../design-system/syntax-tokens.css';
import '../design-system/styles/base.css';
import '../design-system/styles/font.css';
import '../design-system/styles/utilities.css';

// Set once, synchronously, before first paint — same [data-*] convention
// as data-theme (design-system/useTheme.ts), but this doesn't need a hook:
// unlike theme, which system preference can change at runtime, whether
// we're running inside Tauri is fixed for the process's whole lifetime.
// CSS that needs to differ between the desktop app and the browser build
// (e.g. Page.TopBar.css's native-traffic-light clearance) reads this.
document.documentElement.dataset.runtime = isTauri() ? 'tauri' : 'web';

// TEMPORARY — resize-lag investigation. Remove this line and
// devResizeDiagnostics.ts once the investigation is done. Static
// (synchronous) import deliberately, not `import()`: an async dynamic
// import here would let React start rendering — and CodeMirror mount,
// capturing whatever `window.ResizeObserver` was at that moment — before
// this patch finished applying, silently missing the very thing being
// measured. installResizeDiagnostics() itself no-ops outside dev builds.
installResizeDiagnostics();

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
