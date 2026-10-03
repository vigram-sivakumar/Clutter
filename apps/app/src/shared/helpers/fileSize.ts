const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * A file size as people read it — decimal units (1 KB = 1000 bytes, as
 * Finder shows): `0 B`, `812 B`, `12 KB`, `1.2 MB`. One decimal below ten of
 * a unit, none above it; never a trailing `.0`.
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '';
  }

  let value = bytes;
  let unit = 0;

  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }

  const rounded = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;

  // 999.5 KB rounds up to 1000 — present it in the next unit instead.
  if (rounded >= 1000 && unit < UNITS.length - 1) {
    return `1 ${UNITS[unit + 1]}`;
  }

  return `${rounded} ${UNITS[unit]}`;
}
