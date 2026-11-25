import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdownLanguageExtension } from '../markdownLanguage';
import { planMediaBlockInsertion } from './mediaBlockInsertion';

const image = '![[Attachments/shot.png]]';
function insert(doc: string, from: number, to = from, body = image) {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  const plan = planMediaBlockInsertion(state, { from, to }, body);
  const next = state.update({ changes: plan.changes }).state;
  expect(next.sliceDoc(plan.from, plan.to)).toContain(image);
  return next.doc.toString();
}

describe('media block placement', () => {
  it.each([0, 4, 10])('preserves an occupied line at caret %s', (pos) => {
    expect(insert('Hello text\nNext', pos)).toBe('Hello text\n' + image + '\nNext');
  });
  it('uses an empty line without creating an extra line', () => {
    expect(insert('Hello\n\nNext', 6)).toBe('Hello\n' + image + '\nNext');
  });
  it('keeps the task and uses its list continuation indentation for every embed', () => {
    expect(insert('- [ ] Text\n- Next', 8, 8, image + '\n![[paper.pdf]]')).toBe('- [ ] Text\n  ' + image + '\n  ![[paper.pdf]]\n- Next');
  });
  it('preserves ordered list structure', () => {
    expect(insert('12. Text\n13. Next', 6)).toBe('12. Text\n    ' + image + '\n13. Next');
  });
  it('keeps a selected range replacement on one intact line before the media', () => {
    expect(insert('Hello remove text', 6, 12)).toBe('Hello  text\n' + image);
  });
  it('removes the completion trigger without splitting the surrounding text', () => {
    expect(insert('Hello ![[sh text', 6, 11)).toBe('Hello  text\n' + image);
  });
});
