import type { Extension } from '@codemirror/state';

import { tokenSelectionSnap } from '../semanticToken/tokenSelectionSnap';
import { isDateNode } from './dateEngagement';

/**
 * Date-specific entry point onto the generic selection-snap mechanism
 * (`semanticToken/tokenSelectionSnap.ts`) — correct here because, like
 * WikiLink/Tag, a Date's at-rest form is a real rendered widget
 * (`DateWidget`), so "snap anywhere inside the node to its nearer
 * boundary" is exactly the right rule.
 */
export function dateSelectionSnap(): Extension {
  return tokenSelectionSnap(isDateNode);
}
