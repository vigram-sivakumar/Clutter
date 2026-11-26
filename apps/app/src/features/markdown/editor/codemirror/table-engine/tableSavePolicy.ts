import { normalizeAllTablesInMarkdown } from '../table/tableColumnNormalization';

/** Shared native/web development rollout gate. Explicit editor options
 * remain a view-only test override; real app bootstrap uses this same gate. */
export function tableEngineDevEnabled(): boolean {
  return import.meta.env.DEV && (import.meta.env.VITE_CLUTTER_TABLE_ENGINE_CELLS === '1' ||
    (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('tableEngineCells')));
}

/** Persist exactly the staged editor's source. Formatting is an explicit
 * root history operation, never an automatic write-time transform.
 * Keep the unflagged legacy policy until its retirement. */
export function markdownForTableSave(markdown: string): string {
  return tableEngineDevEnabled() ? markdown : normalizeAllTablesInMarkdown(markdown);
}
