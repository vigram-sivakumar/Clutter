import type { PageOperations } from '@core/application/page/PageOperations';

/**
 * The topbar's Duplicate entry point: duplicate, then open the result.
 * PageOperations.duplicate() only performs the copy and returns the new
 * page's id — it never selects or opens anything itself (see its own doc
 * comment), so navigating to the duplicate is this entry point's decision,
 * not the operation's. The sidebar row overflow menu's Duplicate calls
 * pageOperations.duplicate() directly instead, deliberately leaving the
 * current selection untouched (Sidebar.Notes.tsx).
 */
export async function duplicateAndOpenPage(
  pageOperations: PageOperations,
  pageId: string
): Promise<void> {
  const newPageId = await pageOperations.duplicate(pageId);
  await pageOperations.open(newPageId);
}
