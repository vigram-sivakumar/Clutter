/**
 * Global input lock. Prevents selection restore and selection-only dispatch
 * while the browser is processing input (insertText, insertParagraph, etc).
 */
export let isHandlingInput = false;

export function setInputLock(value: boolean): void {
  isHandlingInput = value;
}
