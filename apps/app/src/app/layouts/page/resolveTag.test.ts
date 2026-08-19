import { describe, expect, it, vi } from 'vitest';

import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';

import { createTagResolver } from './resolveTag';

function fakeNavigation(openTag: (name: string) => void): NavigationRouter {
  return { openTag } as unknown as NavigationRouter;
}

/**
 * Deliberately no `Vault`/pages fixtures anywhere in this file: per the
 * locked model in `tagResolution.ts`, a Tag's occurrence in the currently
 * open document is itself the definition — there is no separate
 * "does this already exist in the vault" check to construct fixtures for.
 * The two cases the previous, buggy version of this resolver conflated
 * (an existing, already-persisted tag vs. one only just typed and not yet
 * saved/re-ingested) are asserted explicitly below to resolve identically.
 */
describe('createTagResolver', () => {
  it('a tag with existing usage elsewhere in the vault resolves as "resolved"', () => {
    // No Vault fixture needed to prove this — see file-level comment.
    const resolveTag = createTagResolver(fakeNavigation(vi.fn()));

    expect(resolveTag('project').status).toBe('resolved');
  });

  it('a tag typed for the first time in the still-unsaved current document also resolves as "resolved" — not "unresolved" merely due to save/ingest timing', () => {
    const resolveTag = createTagResolver(fakeNavigation(vi.fn()));

    expect(resolveTag('brandNewNeverSavedTag').status).toBe('resolved');
  });

  it('never returns "unresolved" for any tag name — Tag has no unresolved state, unlike WikiLink', () => {
    const resolveTag = createTagResolver(fakeNavigation(vi.fn()));

    expect(resolveTag('anything').status).not.toBe('unresolved');
  });

  it('activate calls navigation.openTag with the exact name passed to the resolver', () => {
    const openTag = vi.fn();
    const resolveTag = createTagResolver(fakeNavigation(openTag));

    resolveTag('Project').activate();

    expect(openTag).toHaveBeenCalledWith('Project');
    expect(openTag).toHaveBeenCalledTimes(1);
  });

  it('a newly typed, never-before-seen tag still activates via navigation.openTag — no separate "create" step, unlike WikiLink', () => {
    const openTag = vi.fn();
    const resolveTag = createTagResolver(fakeNavigation(openTag));

    resolveTag('newtag').activate();

    expect(openTag).toHaveBeenCalledWith('newtag');
  });
});
