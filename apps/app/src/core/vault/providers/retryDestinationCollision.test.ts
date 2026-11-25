import { describe, expect, it, vi } from 'vitest';
import { DestinationExistsError, retryDestinationCollision } from './VaultFileSystem';

describe('retryDestinationCollision', () => {
  it('retries a refused name without retrying other failures', async () => {
    const attempt = vi.fn().mockRejectedValueOnce(new DestinationExistsError('/a')).mockResolvedValue('/b');
    expect(await retryDestinationCollision(attempt)).toBe('/b');
    expect(attempt).toHaveBeenCalledTimes(2);
    const failed = vi.fn().mockRejectedValue(new Error('disk full'));
    await expect(retryDestinationCollision(failed)).rejects.toThrow('disk full');
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('preserves the final error and stops at the limit', async () => {
    const error = new DestinationExistsError('/a');
    const attempt = vi.fn().mockRejectedValue(error);
    await expect(retryDestinationCollision(attempt, 3)).rejects.toBe(error);
    expect(attempt).toHaveBeenCalledTimes(3);
  });
});
