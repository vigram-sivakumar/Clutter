// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { Application } from '@core/application/Application';
import {
  __clearAllCachedEditorHistoryForTests,
  getCachedEditorSession,
  setCachedEditorSession,
  type CachedEditorSession,
} from '@features/markdown/editor/codemirror/editorHistoryCache';
import { useDeletedPageEditorCacheCleanup } from './useDeletedPageEditorCacheCleanup';

afterEach(() => {
  cleanup();
  __clearAllCachedEditorHistoryForTests();
});

const session = { scrollTop: 10 } as unknown as CachedEditorSession;

function fakeApplication() {
  const listeners = new Set<(ids: readonly string[]) => void>();
  const application = {
    subscribePagesPermanentlyDeleted: (listener: (ids: readonly string[]) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as Application;
  return { application, announce: (ids: readonly string[]) => listeners.forEach((l) => l(ids)), listeners };
}

function Host({ application }: { application: Application }) {
  useDeletedPageEditorCacheCleanup(application);
  return null;
}

describe('useDeletedPageEditorCacheCleanup', () => {
  it('clears the editor session of exactly the pages announced as permanently deleted', () => {
    const { application, announce } = fakeApplication();
    for (const id of ['a', 'b', 'c']) setCachedEditorSession(id, session);
    render(<Host application={application} />);

    announce(['a', 'b']);

    expect(getCachedEditorSession('a')).toBeUndefined();
    expect(getCachedEditorSession('b')).toBeUndefined();
    expect(getCachedEditorSession('c')).toBe(session);
  });

  it('stops listening when unmounted', () => {
    const { application, listeners } = fakeApplication();
    const view = render(<Host application={application} />);
    expect(listeners.size).toBe(1);

    view.unmount();

    expect(listeners.size).toBe(0);
  });
});
