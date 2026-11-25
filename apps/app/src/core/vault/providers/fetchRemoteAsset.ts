import { downloadRemoteBytes } from '@shared/helpers/downloadRemoteBytes';
import { MAX_REMOTE_ASSET_BYTES, type FetchedRemoteAsset } from '../asset/importRemoteAsset';

/** Downloads remote asset bytes before the vault validates the type and saves them. */
export function fetchRemoteAsset(url: string, timeoutMs?: number): Promise<FetchedRemoteAsset> {
  return downloadRemoteBytes(url, MAX_REMOTE_ASSET_BYTES, timeoutMs);
}
