/** Save exactly the editor's committed source, in every runtime.
 * Explicit table formatting belongs to the root transaction/history stream.
 * Keep the existing injected persistence policy seam; no second write path. */
export function markdownForTableSave(markdown: string): string {
  return markdown;
}
