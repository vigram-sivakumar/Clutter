import { isMacPlatform } from './platform';

/**
 * Whether a click is a multi-select toggle click: Cmd + click on macOS, Ctrl + click elsewhere. Only the platform's
 * own modifier counts (Ctrl + click on macOS is a right-click, and the Windows key is not a selection modifier).
 */
export function isMultiSelectToggleClick(
  event: { readonly metaKey: boolean; readonly ctrlKey: boolean },
  mac: boolean = isMacPlatform()
): boolean {
  return mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}
