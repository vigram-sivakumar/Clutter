import { appFetch } from '@shared/helpers/appFetch';
import type { FetchedRemoteAsset } from '../asset/importRemoteAsset';

/**
 * Downloads a remote asset with `appFetch` (the same call
 * `downloadRemoteImage.ts` makes to save an external image — through Tauri's
 * HTTP plugin in the desktop app, since the webview's fetch is CORS-blocked), returning its
 * bytes and declared content type. The platform half of `importRemoteAsset`,
 * which takes it as an injected function so the import logic stays testable.
 */
export async function fetchRemoteAsset(url: string): Promise<FetchedRemoteAsset> {
  const response = await appFetch(url);

  if (!response.ok) {
    throw new Error(`Could not download ${url} (${response.status}).`);
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type'),
  };
}
