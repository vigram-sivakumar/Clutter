import type { Extension } from '@codemirror/state';

import { tokenKeymap } from '../semanticToken/tokenKeymap';
import { getTaskCheckboxActivation } from './taskCheckboxActivation';
import { isTaskMarkerNode } from './taskEngagement';

/**
 * Arrow-key hop over an at-rest `TaskMarker`, same as every other
 * semantic token kind — no checkbox-specific keyboard behavior beyond
 * what the generic mechanism already provides (`tokenKeymap.ts`'s own
 * doc comment: activation is deliberately mouse-only, not bound to Enter).
 */
export function taskCheckboxKeymap(): Extension {
  return tokenKeymap(isTaskMarkerNode, getTaskCheckboxActivation);
}
