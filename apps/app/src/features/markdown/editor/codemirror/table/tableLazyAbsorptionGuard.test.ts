// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';

import { markdownLanguageExtension } from '../markdownLanguage';

const TABLE = '| Name | Age |\n| ---- | --- |\n| John | 30  |';
// The colon alignment markers (rather than a bare `----`) are deliberate,
// not incidental: a plain `---- | ---` delimiter row also happens to match
// this codebase's own, unrelated `LabeledHorizontalRule` extension's
// "---label---" shape (`hr/dividerLabelMatch.ts`'s `matchStraightLabeledDivider`,
// which greedily matches any line trimming to `---...---`) and ends the
// paragraph leaf before Table's own delimiter-row detection ever runs — a
// separate, pre-existing collision between two unrelated grammar
// extensions, out of scope for this fix. A leading `:` sidesteps it
// (`matchStraightLabeledDivider` requires the trimmed line to literally
// start with `---`) while remaining exactly as valid a no-outer-pipe GFM
// delimiter row.
const TABLE_NO_OUTER_PIPES = 'Name | Age\n:--- | ---:\nJohn | 30';

function nodeNamesAt(state: EditorState, pos: number): string[] {
  const names: string[] = [];
  let node = syntaxTree(state).resolveInner(pos, -1);
  while (node) {
    names.push(node.name);
    if (!node.parent) {
      break;
    }
    node = node.parent;
  }
  return names;
}

function hasNode(state: EditorState, name: string): boolean {
  let found = false;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === name) {
        found = true;
      }
    },
  });
  return found;
}

function textOfNode(state: EditorState, name: string): string | null {
  let text: string | null = null;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === name && text === null) {
        text = state.doc.sliceString(node.from, node.to);
      }
    },
  });
  return text;
}

function makeState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
}

describe('tableLazyAbsorptionGuard — a normal paragraph immediately after a table stays a paragraph', () => {
  it('the exact reported reproduction: "Hello world" right after a table, no blank line', () => {
    const doc = `${TABLE}\nHello world`;
    const state = makeState(doc);

    const paragraphText = textOfNode(state, 'Paragraph');
    expect(paragraphText).toBe('Hello world');
    expect(hasNode(state, 'Paragraph')).toBe(true);

    // The absorbed-row regression this guards against: "Hello world" must
    // never appear inside the Table's own text range.
    const tableText = textOfNode(state, 'Table');
    expect(tableText).not.toContain('Hello world');
  });

  it('the "Hello world" line resolves to Paragraph, not TableRow, at its own position', () => {
    const doc = `${TABLE}\nHello world`;
    const state = makeState(doc);
    const pos = doc.indexOf('Hello world') + 1;

    const names = nodeNamesAt(state, pos);
    expect(names).toContain('Paragraph');
    expect(names).not.toContain('Table');
    expect(names).not.toContain('TableRow');
  });

  it('the Table node itself ends exactly at the last real table row, not swallowing the paragraph', () => {
    const doc = `${TABLE}\nHello world`;
    const state = makeState(doc);

    let tableTo = -1;
    syntaxTree(state).iterate({
      enter: (node) => {
        if (node.name === 'Table') {
          tableTo = node.to;
        }
      },
    });

    expect(tableTo).toBe(TABLE.length);
  });
});

describe('tableLazyAbsorptionGuard — multiple paragraphs after a table', () => {
  it('two consecutive non-pipe lines both become paragraph text, not table rows', () => {
    const doc = `${TABLE}\nFirst line\nSecond line`;
    const state = makeState(doc);

    const tableText = textOfNode(state, 'Table');
    expect(tableText).toBe(TABLE);
    expect(hasNode(state, 'Paragraph')).toBe(true);

    const firstPos = doc.indexOf('First line') + 1;
    const secondPos = doc.indexOf('Second line') + 1;
    expect(nodeNamesAt(state, firstPos)).toContain('Paragraph');
    expect(nodeNamesAt(state, secondPos)).toContain('Paragraph');
    expect(nodeNamesAt(state, firstPos)).not.toContain('Table');
    expect(nodeNamesAt(state, secondPos)).not.toContain('Table');
  });

  it('a genuine blank-line-separated paragraph after the table is unaffected (already worked, confirmed still holds)', () => {
    const doc = `${TABLE}\n\nHello world`;
    const state = makeState(doc);

    const tableText = textOfNode(state, 'Table');
    expect(tableText).toBe(TABLE);
    const paragraphText = textOfNode(state, 'Paragraph');
    expect(paragraphText).toBe('Hello world');
  });
});

describe('tableLazyAbsorptionGuard — valid table rows still work', () => {
  it('a real pipe-delimited row immediately after the table is absorbed as a TableRow, unaffected', () => {
    const doc = `${TABLE}\n| Jane | 25  |`;
    const state = makeState(doc);

    const tableText = textOfNode(state, 'Table');
    expect(tableText).toBe(doc);
    expect(hasNode(state, 'TableRow')).toBe(true);

    let rowCount = 0;
    syntaxTree(state).iterate({
      enter: (node) => {
        if (node.name === 'TableRow') {
          rowCount++;
        }
      },
    });
    expect(rowCount).toBe(2);
  });

  it('tables without leading/trailing pipes still parse and still absorb further valid rows', () => {
    const doc = `${TABLE_NO_OUTER_PIPES}\nJane | 25`;
    const state = makeState(doc);

    const tableText = textOfNode(state, 'Table');
    expect(tableText).toBe(doc);
    expect(hasNode(state, 'TableHeader')).toBe(true);
    expect(hasNode(state, 'TableRow')).toBe(true);
  });

  it('tables without leading/trailing pipes still correctly release a following non-pipe paragraph', () => {
    const doc = `${TABLE_NO_OUTER_PIPES}\nHello world`;
    const state = makeState(doc);

    const tableText = textOfNode(state, 'Table');
    expect(tableText).toBe(TABLE_NO_OUTER_PIPES);
    const paragraphText = textOfNode(state, 'Paragraph');
    expect(paragraphText).toBe('Hello world');
  });

  it('a table with just header + delimiter (no data rows yet) still releases a following paragraph', () => {
    const doc = '| Name | Age |\n| ---- | --- |\nHello world';
    const state = makeState(doc);

    const tableText = textOfNode(state, 'Table');
    expect(tableText).toBe('| Name | Age |\n| ---- | --- |');
    const paragraphText = textOfNode(state, 'Paragraph');
    expect(paragraphText).toBe('Hello world');
  });

  it('a stand-alone table with no following content at all is unaffected', () => {
    const state = makeState(TABLE);

    const tableText = textOfNode(state, 'Table');
    expect(tableText).toBe(TABLE);
    expect(hasNode(state, 'Paragraph')).toBe(false);
  });
});

describe('tableLazyAbsorptionGuard — existing table activation behavior remains intact', () => {
  it('the syntax tree still exposes TableHeader/TableRow/TableCell nodes a normal table renders from', () => {
    const doc = `${TABLE}\nHello world`;
    const state = makeState(doc);

    expect(hasNode(state, 'TableHeader')).toBe(true);
    expect(hasNode(state, 'TableRow')).toBe(true);
    expect(hasNode(state, 'TableCell')).toBe(true);
    expect(hasNode(state, 'TableDelimiter')).toBe(true);
  });

  it('the Table node bounds a following non-pipe line no longer overlaps still resolve cleanly for a cursor inside the last real row', () => {
    const doc = `${TABLE}\nHello world`;
    const state = makeState(doc);
    const lastCellPos = doc.indexOf('30') + 1;

    const names = nodeNamesAt(state, lastCellPos);
    expect(names).toContain('Table');
    expect(names).toContain('TableRow');
    expect(names).toContain('TableCell');
  });
});

describe('tableLazyAbsorptionGuard — no regression to fenced/code blocks', () => {
  it('a fenced code block immediately after a table (no blank line) is still recognized as FencedCode, not absorbed', () => {
    const doc = `${TABLE}\n\`\`\`\ncode here\n\`\`\``;
    const state = makeState(doc);

    expect(hasNode(state, 'FencedCode')).toBe(true);
    const tableText = textOfNode(state, 'Table');
    expect(tableText).toBe(TABLE);

    const codePos = doc.indexOf('code here') + 1;
    expect(nodeNamesAt(state, codePos)).toContain('FencedCode');
    expect(nodeNamesAt(state, codePos)).not.toContain('Table');
  });

  it('a table appearing immediately after a fenced code block (no blank line) is unaffected by this guard', () => {
    const doc = `\`\`\`\ncode here\n\`\`\`\n${TABLE}`;
    const state = makeState(doc);

    expect(hasNode(state, 'FencedCode')).toBe(true);
    const tableText = textOfNode(state, 'Table');
    expect(tableText).toBe(TABLE);
  });

  it('an ordinary fenced code block with no adjacent table is completely unaffected', () => {
    const doc = '```\nconst x = 1;\n```';
    const state = makeState(doc);

    expect(hasNode(state, 'FencedCode')).toBe(true);
    expect(hasNode(state, 'Table')).toBe(false);
  });

  it('a paragraph containing a pipe character, unrelated to any table, is unaffected by this guard', () => {
    const doc = 'This has a | pipe in it but is not a table.';
    const state = makeState(doc);

    expect(hasNode(state, 'Table')).toBe(false);
    expect(hasNode(state, 'Paragraph')).toBe(true);
  });
});
