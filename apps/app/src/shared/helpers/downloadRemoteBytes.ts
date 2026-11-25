import { appFetch } from './appFetch';

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30_000;

/** Fetches a non-empty response within a single deadline and bounds the bytes retained from its stream. */
export async function downloadRemoteBytes(
  url: string,
  maxBytes: number,
  timeoutMs: number = DEFAULT_DOWNLOAD_TIMEOUT_MS
): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  try {
    response = await appFetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Could not download ${url} (${response.status}).`);
    }

    const tooLarge = () => new Error(`The file is too large to save: ${url}`);
    const declaredLength = Number(response.headers.get('content-length'));
    if (declaredLength > maxBytes) {
      throw tooLarge();
    }

    reader = response.body?.getReader();
    let bytes = new Uint8Array(0);
    let length = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const end = length + value.byteLength;
        if (end > maxBytes) {
          throw tooLarge();
        }
        if (end > bytes.byteLength) {
          const grown = new Uint8Array(Math.min(maxBytes, Math.max(end, bytes.byteLength * 2)));
          grown.set(bytes.subarray(0, length));
          bytes = grown;
        }
        bytes.set(value, length);
        length = end;
      }
    }

    signal.throwIfAborted();
    if (length === 0) {
      throw new Error(`The download was empty: ${url}`);
    }

    return { bytes: bytes.subarray(0, length), contentType: response.headers.get('content-type') };
  } catch (error) {
    // The native plugin uses stream cancellation to release its response resource.
    void (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => undefined);
    if (signal.aborted) {
      throw new Error(`Timed out downloading ${url}.`);
    }
    if (!response) {
      throw new Error(`Could not download ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
    throw error;
  } finally {
    reader?.releaseLock();
  }
}
