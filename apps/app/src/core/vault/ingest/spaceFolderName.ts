const MAX_FOLDER_NAME_BYTES = 255;

/**
 * Whether `name` can be the name of a new Space's folder: one path component, never a separator,
 * never `.`/`..`, so `<parent>/<name>` can't leave `<parent>`. The one implementation, used by both
 * the form (to flag a bad name) and `createSpaceFolder` (which enforces it).
 */
export function isValidSpaceFolderName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === '.' || trimmed === '..') return false;
  // `/` and `:` are path separators on macOS, `\\` on Windows; control
  // characters are never valid in a file name.
  // eslint-disable-next-line no-control-regex
  if (/[/\\:\u0000-\u001f]/.test(trimmed)) return false;
  return new TextEncoder().encode(trimmed).length <= MAX_FOLDER_NAME_BYTES;
}
