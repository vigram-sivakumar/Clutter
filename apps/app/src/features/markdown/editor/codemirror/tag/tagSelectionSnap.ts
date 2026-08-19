import type { Extension } from '@codemirror/state';

import { tokenSelectionSnap } from '../semanticToken/tokenSelectionSnap';
import { isTagNode } from './tagEngagement';

/**
 * Tag-specific entry point onto the generic selection-snap mechanism
 * (`semanticToken/tokenSelectionSnap.ts`) — correct here because, like
 * WikiLink, a Tag's at-rest form is a real rendered widget (`TagWidget`),
 * so "snap anywhere inside the node to its nearer boundary" is exactly the
 * right rule (as opposed to `liveMarkSelectionSnap.ts`'s marker-sub-range-only
 * snapping, which exists for constructs whose collapsed markers render
 * zero pixels — not the case here).
 */
export function tagSelectionSnap(): Extension {
  return tokenSelectionSnap(isTagNode);
}
