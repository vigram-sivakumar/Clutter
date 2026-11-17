// Compile-time API regression checks. Never a runtime composition entry.
import type { Command, PageContent } from './contracts.ts';
const read: Command = {
  apiVersion: 1,
  spaceId: 's',
  method: 'page.read',
  pageId: 'p',
};
// @ts-expect-error version is a literal contract, not any number
const wrongVersion: Command = { ...read, apiVersion: 2 };
// @ts-expect-error the catalogue requires a guarded update
const missingHead: Command = {
  apiVersion: 1,
  spaceId: 's',
  method: 'page.update',
  pageId: 'p',
  operationId: 'o',
  patch: { properties: {} },
};
const mismatch: PageContent['properties'] = {
  // @ts-expect-error typed property values cannot disagree with their type
  due: { type: 'number', value: 'tomorrow' },
};
void [read, wrongVersion, missingHead, mismatch];
