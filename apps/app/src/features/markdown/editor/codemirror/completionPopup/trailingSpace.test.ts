// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { acceptCompletion, completionStatus, startCompletion } from '@codemirror/autocomplete';
import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { semanticCompletion } from '../completion';
import { markdownLanguageExtension } from '../markdownLanguage';
import { formatDateForTest } from './trailingSpace.testHelpers';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const views: EditorView[] = [];
afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  document.body.innerHTML = '';
});

/** `doc` with the cursor at `|`, a real popup opened there, and the first suggestion accepted. */
async function acceptAt(doc: string): Promise<EditorView> {
  const anchor = doc.indexOf('|');
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc: doc.replace('|', ''),
      selection: { anchor },
      extensions: [
        markdownLanguageExtension(),
        history(),
        semanticCompletion(
          () => () => [{ kind: 'page', path: 'Design/Guidelines', title: 'Guidelines', breadcrumb: 'Design' }],
          () => () => ['project'],
          () => () => [{ kind: 'resource', path: 'hero.png', title: 'hero.png', breadcrumb: null, resourceKind: 'image' }]
        ),
      ],
    }),
    parent,
  });
  views.push(view);
  startCompletion(view);
  await wait(250);
  expect(completionStatus(view.state)).toBe('active');
  expect(acceptCompletion(view)).toBe(true);
  return view;
}

const head = (view: EditorView) => view.state.selection.main.head;

describe('a trailing space after an accepted tag, date or wiki link', () => {
  it('tag: #pro → #project, then one space, cursor after it', async () => {
    const view = await acceptAt('x #pro|');

    expect(view.state.doc.toString()).toBe('x #project ');
    expect(head(view)).toBe('x #project '.length);
  });

  it('date: @Tom → @<date>, then one space, cursor after it', async () => {
    const view = await acceptAt('@Tom|');

    expect(view.state.doc.toString()).toBe(`@${formatDateForTest(1)} `);
    expect(head(view)).toBe(view.state.doc.length);
  });

  it('wiki link: [[Gui → [[Design/Guidelines]], then one space, cursor after it', async () => {
    const view = await acceptAt('See [[Gui|');

    expect(view.state.doc.toString()).toBe('See [[Design/Guidelines]] ');
    expect(head(view)).toBe(view.state.doc.length);
  });

  it('wiki link already closed (the usual case with auto-closed brackets): the space goes after the "]]"', async () => {
    const view = await acceptAt('See [[Gui|]]');

    expect(view.state.doc.toString()).toBe('See [[Design/Guidelines]] ');
    expect(head(view)).toBe(view.state.doc.length);
  });

  describe('a space already there is not doubled', () => {
    it.each([
      ['tag', 'x #pro| y', 'x #project y', 'x #project '.length],
      ['wiki link', 'x [[Gui| y', 'x [[Design/Guidelines]] y', 'x [[Design/Guidelines]] '.length],
      ['closed wiki link', 'x [[Gui|]] y', 'x [[Design/Guidelines]] y', 'x [[Design/Guidelines]] '.length],
    ])('%s: the existing space stays the only one, and the cursor moves past it', async (_name, before, after, cursor) => {
      const view = await acceptAt(before);

      expect(view.state.doc.toString()).toBe(after);
      expect(head(view)).toBe(cursor);
    });

    it('date: the existing space stays the only one', async () => {
      const view = await acceptAt('@Tom| later');

      expect(view.state.doc.toString()).toBe(`@${formatDateForTest(1)} later`);
      expect(head(view)).toBe(`@${formatDateForTest(1)} `.length);
    });
  });

  it('text right after a closed link is kept, a space put between them', async () => {
    const view = await acceptAt('See [[Gui|]]tail');

    expect(view.state.doc.toString()).toBe('See [[Design/Guidelines]] tail');
    expect(head(view)).toBe('See [[Design/Guidelines]] '.length);
  });

  it('is one undo step: undoing removes the completion and its space together', async () => {
    const tag = await acceptAt('x #pro|');
    expect(tag.state.doc.toString()).toBe('x #project ');
    undo(tag);
    expect(tag.state.doc.toString()).toBe('x #pro');

    const link = await acceptAt('See [[Gui|]]');
    undo(link);
    expect(link.state.doc.toString()).toBe('See [[Gui]]');

    const date = await acceptAt('@Tom|');
    undo(date);
    expect(date.state.doc.toString()).toBe('@Tom');
  });

  it('an embed does not get the space — it has its own new-line behaviour', async () => {
    const view = await acceptAt('![[he|');

    expect(view.state.doc.toString()).not.toMatch(/\]\] $/);
    expect(view.state.doc.toString()).toContain('![[hero.png]]');
  });
});
