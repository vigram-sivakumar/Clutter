import { useEffect } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';

// The native window starts hidden (tauri.conf.json `"visible": false`) so
// WKWebView's white pre-paint never shows. Rust shows and focuses it when this
// fires; `frontend_ready` there is idempotent, and this module-level guard
// means a re-render or StrictMode's double effect sends it at most once per
// page load. A reload (e.g. the open space being deleted) starts a fresh
// module, and the repeat call is harmless — the window is already visible.
let signalled = false;

/**
 * Tells the native shell this page has rendered its first real screen.
 * Pass `ready` as true only once the shell knows which screen it is showing —
 * not while it is still waiting to decide. Not about the workspace itself
 * having finished loading: a placeholder or error screen counts. The theme is
 * already applied by then (index.html resolves `data-theme` and the first-paint
 * background before any script runs).
 *
 * No requestAnimationFrame: a hidden window's page is not visible, so frames
 * are not scheduled and a callback would never run.
 */
export function useFrontendReady(ready: boolean): void {
  useEffect(() => {
    if (!ready || signalled || !isTauri()) return;
    signalled = true;
    invoke('frontend_ready').catch((error) => {
      signalled = false;
      console.error('Failed to signal frontend readiness:', error);
    });
  }, [ready]);
}
