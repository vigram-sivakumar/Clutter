// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { createInlineLivePreviewParticipants, type ParticipantResolvers } from '../highlight/inlineLivePreviewParticipants';
import { inlineLivePreviewRegion, refreshInlinePresentation } from '../highlight/inlineLivePreviewRegion';
import type { ResolveTag, TagResolution } from './tagResolution';
import { TagWidget } from './TagWidget';

/**
 * A tag reference in the Markdown body shows the tag's emoji in place of the `#` when the host resolves it with an
 * `icon` (the Show tag emojis setting is the host's decision — see resolveTag.ts); the Markdown itself is untouched.
 */
const resolved = (displayLabel: string, icon?: string): TagResolution => ({
  status: 'resolved',
  displayLabel,
  ...(icon ? { icon } : {}),
  activate: () => {},
});

describe('TagWidget', () => {
  const dom = (resolution: TagResolution) => new TagWidget('#design', resolution).toDOM();

  it('without an icon: the dimmed `#` prefix, then the label (as before)', () => {
    const el = dom(resolved('design'));
    const prefix = el.querySelector('.tok-tag-prefix')!;

    expect(prefix.textContent).toBe('#');
    expect(prefix.classList.contains('tok-tag-prefix--emoji')).toBe(false);
    expect(el.textContent).toBe('#design');
  });

  it('with an icon: the emoji in the prefix in place of the `#`, as plain text — no `#`, no empty slot', () => {
    const el = dom(resolved('design', '📦'));
    const prefix = el.querySelector('.tok-tag-prefix')!;

    expect(prefix.textContent).toBe('📦');
    expect(prefix.classList.contains('tok-tag-prefix--emoji')).toBe(true);
    expect(el.textContent).toBe('📦design');
    expect(el.querySelectorAll('.tok-tag-prefix')).toHaveLength(1);
    expect(el.querySelector('svg, img, .app-icon')).toBeNull();
  });

  it('keeps its accessible name and status whether or not the emoji shows', () => {
    const plain = dom(resolved('design'));
    const withIcon = dom(resolved('design', '📦'));

    expect(withIcon.getAttribute('aria-label')).toBe(plain.getAttribute('aria-label'));
    expect(withIcon.getAttribute('role')).toBe('button');
    expect(withIcon.dataset.tagStatus).toBe('resolved');
  });

  it('is a different widget when the icon differs, so the editor redraws it', () => {
    const a = new TagWidget('#design', resolved('design'));
    const b = new TagWidget('#design', resolved('design', '📦'));
    const c = new TagWidget('#design', resolved('design', '📦'));

    expect(a.eq(b)).toBe(false);
    expect(b.eq(c)).toBe(true);
  });
});

describe('a tag reference in the editor', () => {
  let showEmoji = true;
  const resolveTag: ResolveTag = (name) => resolved(name, showEmoji && name === 'design' ? '📦' : undefined);
  const resolvers: ParticipantResolvers = {
    resolveWikiLink: () => undefined,
    resolveTag: () => resolveTag,
    resolveDate: () => undefined,
  } as unknown as ParticipantResolvers;

  function mount(doc: string): EditorView {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    return new EditorView({
      state: EditorState.create({
        doc,
        extensions: [markdownLanguageExtension(), inlineLivePreviewRegion(createInlineLivePreviewParticipants(resolvers))],
      }),
      parent,
    });
  }
  const prefixes = (view: EditorView) =>
    [...view.dom.querySelectorAll('.tok-tag .tok-tag-prefix')].map((el) => el.textContent);

  it('shows the emoji instead of the `#` for a tag that has one, and `#` for one that has none', () => {
    showEmoji = true;
    const view = mount('see #design and #plain here');

    expect(prefixes(view)).toEqual(['📦', '#']);
  });

  it('shows `#` for every tag when the emoji is hidden, with no emoji left behind', () => {
    showEmoji = false;
    const view = mount('see #design and #plain here');

    expect(prefixes(view)).toEqual(['#', '#']);
    expect(view.dom.querySelector('.tok-tag-prefix--emoji')).toBeNull();
    expect(view.dom.textContent).not.toContain('📦');
  });

  it('follows a change as soon as the inline presentation is refreshed, both ways, without a re-mount', () => {
    showEmoji = true;
    const view = mount('see #design here');
    expect(prefixes(view)).toEqual(['📦']);

    showEmoji = false;
    view.dispatch({ effects: refreshInlinePresentation.of(null) });
    expect(prefixes(view)).toEqual(['#']);

    showEmoji = true;
    view.dispatch({ effects: refreshInlinePresentation.of(null) });
    expect(prefixes(view)).toEqual(['📦']);
  });

  it('never changes the Markdown: the document still holds `#design`', () => {
    showEmoji = true;
    const view = mount('see #design here');

    expect(view.state.doc.toString()).toBe('see #design here');
  });
});
