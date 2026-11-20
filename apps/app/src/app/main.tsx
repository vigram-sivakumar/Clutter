/**
 * Entry point for Engine Demo
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  hasInitializedLaunchAtLogin,
  LAUNCH_AT_LOGIN_STATUS_CHANGED_EVENT,
  markLaunchAtLoginInitialized,
} from '@shared/helpers/launchAtLoginPreference';
import { App } from './App';
import { installResizeDiagnostics } from './devResizeDiagnostics';
import { installNativeContextMenuPolicy } from './suppressNativeContextMenu';
import { installMarkdownItalicFontSync } from '@shared/helpers/markdownItalicFontPreference';
import { installPreserveBulletStyleSync } from '@shared/helpers/preserveBulletStylePreference';

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

// Launch at Login is enabled on first launch. Once this initial decision has been made, never
// re-register automatically: the user may subsequently disable Clutter in System Settings.
if (isTauri() && !hasInitializedLaunchAtLogin()) {
  void invoke<string>('get_launch_at_login_status')
    .then(async (status) => {
      if (status === 'not-registered') {
        await invoke<string>('set_launch_at_login_enabled', { enabled: true });
      }

      if (status === 'enabled' || status === 'not-registered' || status === 'requires-approval') {
        markLaunchAtLoginInitialized();
        window.dispatchEvent(new Event(LAUNCH_AT_LOGIN_STATUS_CHANGED_EVENT));
      }
    })
    .catch(() => {
      // A failed registration remains eligible for a retry on the next app launch.
    });
}

// Reflects the Markdown italic font setting on the root element, now and on every change (tokens.css reads it).
installMarkdownItalicFontSync();

// Reflects the Preserve bullet style setting on the root element, now and on every change (the list CSS reads it).
installPreserveBulletStyleSync();

// Production draws its own context menus: no native WebView menu (Reload, Inspect Element…) anywhere.
// Development keeps the native one, for Inspect Element.
installNativeContextMenuPolicy();

// TEMPORARY — resize-lag investigation. Remove this line and
// devResizeDiagnostics.ts once the investigation is done. Static
// (synchronous) import deliberately, not `import()`: an async dynamic
// import here would let React start rendering — and CodeMirror mount,
// capturing whatever `window.ResizeObserver` was at that moment — before
// this patch finished applying, silently missing the very thing being
// measured. installResizeDiagnostics() itself no-ops outside dev builds.
installResizeDiagnostics();

// TEMPORARY — autocomplete design lab (src/app/devLab/). Remove this block
// and that folder when the design is done. Dev builds only.
if (import.meta.env.DEV) {
  void import('./devLab/mountDevLab').then((m) => m.mountDevLab());
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
