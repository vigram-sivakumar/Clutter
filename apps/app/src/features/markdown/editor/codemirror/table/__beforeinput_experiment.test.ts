// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

describe('beforeinput ordering experiment', () => {
  it('a domEventHandlers beforeinput handler can preempt CM6 default insertion', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    let sawEvent = false;
    const view = new EditorView({
      state: EditorState.create({
        doc: 'hello',
        extensions: [
          EditorView.domEventHandlers({
            beforeinput: (event) => {
              sawEvent = true;
              if (event.inputType === 'insertText') {
                return true; // claim it
              }
              return false;
            },
          }),
        ],
      }),
      parent,
    });
    view.focus();
    view.dispatch({ selection: { anchor: 5 } });

    const ev = new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: 'X',
      bubbles: true,
      cancelable: true,
    });
    view.contentDOM.dispatchEvent(ev);

    expect(sawEvent).toBe(true);
    expect(ev.defaultPrevented).toBe(true);
    // If our handler truly won the race, CM6's own default insertion
    // handling (which reads `beforeinput`'s `data` and would otherwise
    // dispatch a text-insertion transaction itself) never ran, so the
    // document is untouched.
    expect(view.state.doc.toString()).toBe('hello');

    view.destroy();
  });
});
