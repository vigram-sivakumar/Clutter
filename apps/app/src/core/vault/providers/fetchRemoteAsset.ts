import { appFetch } from '@shared/helpers/appFetch';
import { MAX_REMOTE_ASSET_BYTES, type FetchedRemoteAsset } from '../asset/importRemoteAsset';

/** How long a remote download may take before it is abandoned. */
export const REMOTE_ASSET_TIMEOUT_MS = 30_000;

/**
 * Downloads a remote asset with `appFetch` (through Tauri's HTTP plugin in the
 * desktop app, since the webview's fetch is CORS-blocked), returning its bytes
 * and declared content type. Redirects are followed. Rejects — so nothing is
 * saved or rewritten — on a non-2xx status, a network failure, a timeout, or
 * a body over the size limit (checked from `Content-Length` before reading it
 * and again on the bytes). The platform half of `importRemoteAsset`, which
 * takes it as an injected function so the import logic stays testable.
 */
export async function fetchRemoteAsset(
  url: string,
  timeoutMs: number = REMOTE_ASSET_TIMEOUT_MS
): Promise<FetchedRemoteAsset> {
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;

  try {
    response = await appFetch(url, { signal });
  } catch (error) {
    if (signal.aborted) {
      throw new Error(`Timed out downloading ${url}.`);
    }

    throw new Error(`Could not download ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!response.ok) {
    throw new Error(`Could not download ${url} (${response.status}).`);
  }

  const declaredLength = Number(response.headers.get('content-length'));

  if (Number.isFinite(declaredLength) && declaredLength > MAX_REMOTE_ASSET_BYTES) {
    throw new Error(`The file is too large to save: ${url}`);
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type'),
  };
}
