import { describe, expect, it } from 'vitest';
import { evaluateTemplateMarker } from './templateMarker';

describe('evaluateTemplateMarker', () => {
  describe('inside Templates', () => {
    it('appends `kind: template` when there is no kind, leaving every other line alone', () => {
      expect(evaluateTemplateMarker(['Priority: high'], true)).toEqual([
        'Priority: high',
        'kind: template',
      ]);
      expect(evaluateTemplateMarker([], true)).toEqual(['kind: template']);
    });

    it('replaces an existing scalar kind, leaving other lines byte-identical', () => {
      expect(evaluateTemplateMarker(['Priority: high', 'kind: book', 'Owner: me'], true)).toEqual([
        'Priority: high',
        'kind: template',
        'Owner: me',
      ]);
    });

    it('is a no-op when already `kind: template`', () => {
      expect(evaluateTemplateMarker(['kind: template'], true)).toBeNull();
    });

    it('never touches a list kind or a differently-cased Kind', () => {
      expect(evaluateTemplateMarker(['kind:', '  - a', '  - b'], true)).toBeNull();
      expect(evaluateTemplateMarker(['Kind: book'], true)).toBeNull();
    });
  });

  describe('outside Templates', () => {
    it('removes `kind: template`, keeping other lines', () => {
      expect(evaluateTemplateMarker(['Priority: high', 'kind: template'], false)).toEqual([
        'Priority: high',
      ]);
    });

    it("leaves a user's own kind, and a page with no kind, untouched", () => {
      expect(evaluateTemplateMarker(['kind: book'], false)).toBeNull();
      expect(evaluateTemplateMarker(['Priority: high'], false)).toBeNull();
      expect(evaluateTemplateMarker([], false)).toBeNull();
    });
  });
});
