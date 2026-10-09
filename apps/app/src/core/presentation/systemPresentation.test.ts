import { describe, expect, it } from 'vitest';

import {
  getSystemLocationPresentation,
  type SystemLocationId,
} from './systemPresentation';

// Folder-backed reserved locations (materialized as a real Vault Folder)
// and non-folder-backed ones (a filtered/computed view with nothing on
// disk) used to take two different code paths in PageHost — only the
// folder-backed path checked SHOW_RESERVED_FOLDER_ICON. Both groups are
// asserted together here specifically to pin down that they must now
// behave identically through getSystemLocationPresentation's single
// 'page-header' surface, regardless of which group a given id is in.
const FOLDER_BACKED_LOCATIONS: readonly SystemLocationId[] = [
  'archive',
  'inbox',
  'templates',
  'daily-notes',
];

const VIEW_LOCATIONS: readonly SystemLocationId[] = [
  'notes',
  'tasks',
  'tasks-all',
  'tasks-unscheduled',
  'tags',
  'favorites',
  'workspace',
  'assets',
];

describe('getSystemLocationPresentation', () => {
  describe('default (no surface)', () => {
    it('returns the canonical icon for a folder-backed location, unaffected by the page-header flag', () => {
      expect(getSystemLocationPresentation('archive').icon).toBe('archive');
    });

    it('returns the canonical icon for a non-folder view location, unaffected by the page-header flag', () => {
      expect(getSystemLocationPresentation('tasks-all').icon).toBe(
        'circleTick'
      );
    });

    it('still exposes collectionIcon for a location that has one', () => {
      expect(getSystemLocationPresentation('daily-notes').collectionIcon).toBe(
        'calendarDots'
      );
    });
  });

  describe("surface: 'page-header'", () => {
    it.each(FOLDER_BACKED_LOCATIONS)(
      'exposes no icon for folder-backed location %s while SHOW_RESERVED_FOLDER_ICON is false',
      (id) => {
        expect(
          getSystemLocationPresentation(id, 'page-header').icon
        ).toBeUndefined();
      }
    );

    it.each(VIEW_LOCATIONS)(
      'exposes no icon for view location %s while SHOW_RESERVED_FOLDER_ICON is false',
      (id) => {
        expect(
          getSystemLocationPresentation(id, 'page-header').icon
        ).toBeUndefined();
      }
    );

    it.each([...FOLDER_BACKED_LOCATIONS, ...VIEW_LOCATIONS])(
      'still exposes the label for %s even though the icon is suppressed',
      (id) => {
        expect(getSystemLocationPresentation(id, 'page-header').label).toBe(
          getSystemLocationPresentation(id).label
        );
      }
    );
  });
});
