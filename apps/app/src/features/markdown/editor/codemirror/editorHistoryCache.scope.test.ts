import { afterEach, expect, it } from 'vitest';
import { __clearAllCachedEditorHistoryForTests, getCachedEditorSession, setCachedEditorSession, clearCachedEditorSession, type CachedEditorSession } from './editorHistoryCache';

afterEach(__clearAllCachedEditorHistoryForTests);

it('isolates identical page IDs across Applications and standalone editors', () => {
  const a = {}, b = {};
  const first = { domScrollTop: 10 } as CachedEditorSession;
  const second = { domScrollTop: 20 } as CachedEditorSession;
  setCachedEditorSession('same-page', first, a);
  expect(getCachedEditorSession('same-page', b)).toBeUndefined();
  expect(getCachedEditorSession('same-page')).toBeUndefined();
  setCachedEditorSession('same-page', second, b);
  expect(getCachedEditorSession('same-page', a)).toBe(first);
  expect(getCachedEditorSession('same-page', b)).toBe(second);
  clearCachedEditorSession('same-page', a);
  expect(getCachedEditorSession('same-page', a)).toBeUndefined();
  expect(getCachedEditorSession('same-page', b)).toBe(second);
});
