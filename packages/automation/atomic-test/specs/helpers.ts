/** Shared steps for the atomic-save real-app specs. */
import fs from 'node:fs';
import path from 'node:path';

export const HOME = process.env.CLUTTER_FAKE_HOME as string;

export async function registerSpace(root: string): Promise<void> {
  await browser.execute((value: string) => localStorage.setItem('clutter.spaces.v1', JSON.stringify({ paths: [value], activePath: value })), root);
  await browser.refresh();
}

export async function openFirstNote(testId: (tab: string) => string): Promise<void> {
  const tab = await $(`[data-testid="${testId('notes')}"]`);
  await tab.waitForExist({ timeout: 30000 });
  await tab.click();
  await (await $('[data-testid^="sidebar.noteItem."]')).click();
  await (await $('.cm-content')).waitForExist({ timeout: 15000 });
}

/** Inserts text at the end of the document through an input command (the editor's own input path). */
export async function typeAtEnd(text: string): Promise<void> {
  await browser.execute((value: string) => {
    const content = document.querySelector('.cm-content') as HTMLElement;
    content.focus();
    const range = document.createRange();
    range.selectNodeContents(content);
    range.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('insertText', false, value);
  }, text);
}

/** Recovery snapshot files the isolated app has written. */
export function recoveryFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/recovery/i.test(full)) found.push(full);
    }
  };
  walk(`${HOME}/Library/Application Support/com.clutter.atomictest`);
  return found;
}

export const temporaryFiles = (root: string): string[] => fs.readdirSync(root).filter((name) => name.startsWith('.clutter-tmp.'));
