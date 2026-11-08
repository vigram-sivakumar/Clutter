// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import type { PasteAssets } from './assetPaste';
import { pasteRouting } from './pasteRouting';
import { externalPasteNormalization, normalizeExternalPaste } from './externalPaste';

/**
 * Checkbox-looking text in a pasted list item is text; only a real HTML checkbox makes a task.
 *
 * The HTML converter escapes literal `[ ]` (`\[ \]`) so it stays text. `normalizeExternalPaste` used to run over that
 * output with its rule for exporters that escape their own task markers (`TASK_ESCAPED`), which turned the escape back
 * into a real task. The HTML paste now compacts without that rule; plain text still gets it. Checked through the real
 * paste handler (not `htmlToPieces` alone, which never reaches the normalization) as the pasted Markdown and as the
 * Clutter grammar's parse of it.
 */
const assets: PasteAssets = { importFile: async () => 'Assets/x.png', onFailed: () => undefined };

function mount(): EditorView {
  const parent = document.body.appendChild(document.createElement('div'));
  return new EditorView({
    state: EditorState.create({ doc: '', extensions: [markdownLanguageExtension(), pasteRouting(() => assets), externalPasteNormalization()] }),
    parent,
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

async function pasteHtml(html: string): Promise<string> {
  const view = mount();
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { files: [], getData: (type: string) => (type === 'text/html' ? html : '') },
  });
  view.contentDOM.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return view.state.doc.toString();
}

function pasteText(text: string): string {
  const view = mount();
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { files: [], getData: (type: string) => (type === 'text/plain' ? text : '') },
  });
  view.contentDOM.dispatchEvent(event);
  return view.state.doc.toString();
}

const SHAPE_NAMES: Record<string, string> = {
  BulletList: 'ul',
  ListItem: 'li',
  Paragraph: 'p',
  InlineCode: 'code',
  Task: 'task',
};

/** The block structure of `doc` as a nested string, e.g. `ul(li(p()))`; a task item shows `task`. */
function shape(doc: string): string {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  ensureSyntaxTree(state, doc.length, 5000);
  const walk = (node: { name: string; firstChild: any; nextSibling: any }): string => {
    const parts: string[] = [];
    for (let child = node.firstChild; child; child = child.nextSibling) {
      const inner = walk(child);
      if (inner) {
        parts.push(inner);
      }
    }
    const name = SHAPE_NAMES[node.name];
    return name ? `${name}(${parts.join('')})` : parts.join('');
  };
  return walk(syntaxTree(state).topNode as any);
}

/** The source text of every node called `name` in the parse of `doc`, in order. */
function nodeTexts(doc: string, name: string): string[] {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  ensureSyntaxTree(state, doc.length, 5000);
  const found: string[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === name) {
        found.push(doc.slice(node.from, node.to));
      }
    },
  });
  return found;
}

describe('literal checkbox text in a pasted list item is not a task', () => {
  it('<li>[ ] Buy groceries</li> stays one ordinary bullet', async () => {
    const markdown = await pasteHtml('<ul><li>[ ] Buy groceries</li></ul>');

    expect(markdown).toBe('- \\[ \\] Buy groceries');
    expect(shape(markdown)).toBe('ul(li(p()))');
    expect(nodeTexts(markdown, 'TaskMarker')).toEqual([]);
    expect(nodeTexts(markdown, 'Escape')).toEqual(['\\[', '\\]']);
  });

  it('<li>[x] Completed</li> stays one ordinary bullet', async () => {
    const markdown = await pasteHtml('<ul><li>[x] Completed</li></ul>');

    expect(markdown).toBe('- \\[x\\] Completed');
    expect(shape(markdown)).toBe('ul(li(p()))');
    expect(nodeTexts(markdown, 'TaskMarker')).toEqual([]);
  });

  it('the same holds in an ordered list', async () => {
    const markdown = await pasteHtml('<ol><li>[ ] Buy groceries</li></ol>');

    expect(markdown).toBe('1. \\[ \\] Buy groceries');
    expect(nodeTexts(markdown, 'TaskMarker')).toEqual([]);
  });

  it('checkbox text inside <code> stays inline code', async () => {
    const markdown = await pasteHtml('<ul><li><code>[ ] Buy groceries</code></li></ul>');

    expect(markdown).toBe('- `[ ] Buy groceries`');
    expect(shape(markdown)).toBe('ul(li(p(code())))');
    expect(nodeTexts(markdown, 'TaskMarker')).toEqual([]);
  });

  it('a nested list item with literal checkbox text is a plain nested bullet', async () => {
    const markdown = await pasteHtml('<ul><li>Parent<ul><li>[ ] Child</li></ul></li></ul>');

    expect(markdown).toBe('- Parent\n    - \\[ \\] Child');
    expect(shape(markdown)).toBe('ul(li(p()ul(li(p()))))');
    expect(nodeTexts(markdown, 'TaskMarker')).toEqual([]);
  });
});

describe('genuine HTML checkboxes still become tasks', () => {
  it('an unchecked checkbox', async () => {
    const markdown = await pasteHtml('<ul><li><input type="checkbox"> Buy groceries</li></ul>');

    expect(markdown).toBe('- [ ] Buy groceries');
    expect(nodeTexts(markdown, 'TaskMarker')).toEqual(['[ ]']);
  });

  it('a checked checkbox', async () => {
    const markdown = await pasteHtml('<ul><li><input type="checkbox" checked> Completed</li></ul>');

    expect(markdown).toBe('- [x] Completed');
    expect(nodeTexts(markdown, 'TaskMarker')).toEqual(['[x]']);
  });

  it('a real checkbox next to literal checkbox text: one task, one plain bullet', async () => {
    const markdown = await pasteHtml('<ul><li><input type="checkbox"> Real</li><li>[ ] Literal</li></ul>');

    expect(markdown).toBe('- [ ] Real\n- \\[ \\] Literal');
    expect(nodeTexts(markdown, 'TaskMarker')).toEqual(['[ ]']);
  });

  it('a real checkbox whose text starts with literal checkbox text keeps the text literal', async () => {
    const markdown = await pasteHtml('<ul><li><input type="checkbox"> [ ] Both</li></ul>');

    expect(markdown).toBe('- [ ] \\[ \\] Both');
    expect(nodeTexts(markdown, 'TaskMarker')).toEqual(['[ ]']);
  });
});

describe('the exporter rule is unchanged for plain text and the default', () => {
  it('plain text with an exporter-escaped task marker still becomes a task', () => {
    expect(pasteText('- \\[ \\] Task\n- \\[x\\] Done')).toBe('- [ ] Task\n- [x] Done');
  });

  it('normalizeExternalPaste restores by default and not when asked not to', () => {
    expect(normalizeExternalPaste('- \\[ \\] Task')).toBe('- [ ] Task');
    expect(normalizeExternalPaste('- \\[ \\] Task', { restoreEscapedTasks: false })).toBe('- \\[ \\] Task');
  });

  it('the option does not turn off the other compaction rules', () => {
    expect(normalizeExternalPaste('- [ ]  Task\n\n\n\ntext', { restoreEscapedTasks: false })).toBe('- [ ] Task\n\ntext');
  });
});
