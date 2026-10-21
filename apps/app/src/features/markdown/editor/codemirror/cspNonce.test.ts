// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';

let tauri = false;
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => tauri }));

import { createEditorView } from './createEditorView';
import { readStyleNonce } from './cspNonce';

function addStyle(nonce?: string): HTMLStyleElement {
  const style = document.createElement('style');
  if (nonce !== undefined) style.nonce = nonce;
  document.head.appendChild(style);
  return style;
}

function newEditor(): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return createEditorView({ doc: 'Hello', parent });
}

beforeEach(() => {
  tauri = false;
});
afterEach(() => {
  document.head.querySelectorAll('style').forEach((style) => style.remove());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('readStyleNonce', () => {
  it('reads the nonce from the .nonce property of a <style> element', () => {
    addStyle('abc123');

    expect(readStyleNonce()).toBe('abc123');
  });

  it('skips <style> elements without a nonce', () => {
    addStyle();
    addStyle('abc123');

    expect(readStyleNonce()).toBe('abc123');
  });

  it('is undefined when no <style> carries a nonce (development, the web build)', () => {
    addStyle();

    expect(readStyleNonce()).toBeUndefined();
  });
});

describe('createEditorView — CSP nonce', () => {
  it('gives the editor the page nonce, and CodeMirror stamps it on the <style> elements it injects', () => {
    const firstPaint = addStyle('abc123');

    const view = newEditor();

    expect(view.state.facet(EditorView.cspNonce)).toBe('abc123');
    const injected = [...document.head.querySelectorAll('style')].filter((style) => style !== firstPaint);
    expect(injected.length).toBeGreaterThan(0);
    for (const style of injected) expect(style.getAttribute('nonce')).toBe('abc123');
  });

  it('gives every later editor (another page, a reference preview) the same nonce', () => {
    addStyle('abc123');

    const first = newEditor();
    const second = newEditor();

    expect(second.state.facet(EditorView.cspNonce)).toBe('abc123');
    expect(second.state.facet(EditorView.cspNonce)).toBe(first.state.facet(EditorView.cspNonce));
  });

  it('creates the editor normally, with no nonce configured, when the page has none (development)', () => {
    const view = newEditor();

    expect(view.state.facet(EditorView.cspNonce)).toBe('');
    expect(view.state.doc.toString()).toBe('Hello');
  });

  describe('a packaged desktop build with no nonce to find', () => {
    it('says so, once, instead of failing silently — and still creates the editor with nothing substituted', async () => {
      vi.stubEnv('DEV', false);
      tauri = true;
      vi.resetModules();
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { createEditorView: create } = await import('./createEditorView');
      const make = () => {
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        return create({ doc: 'Hello', parent });
      };

      const first = make();
      make();

      expect(first.state.facet(EditorView.cspNonce)).toBe('');
      const reports = error.mock.calls.filter(([message]) => String(message).includes('no CSP style nonce'));
      expect(reports).toHaveLength(1);
    });

    it('stays quiet in development, where there is no nonce to find', () => {
      tauri = true;
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});

      newEditor();

      expect(error).not.toHaveBeenCalled();
    });
  });
});
