import { isTauri } from '@tauri-apps/api/core';

/**
 * `fetch` for downloading a file from an arbitrary site. In the desktop app
 * the request goes through Tauri's HTTP plugin (made from Rust), because the
 * webview's own `fetch` is blocked by CORS for almost every image host — the
 * page's origin is `localhost` and those hosts don't allow it. Elsewhere (the
 * web runtime, tests) it is the plain `fetch`.
 */
export async function appFetch(url: string): Promise<Response> {
  if (isTauri()) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    return tauriFetch(url);
  }

  return fetch(url);
}
