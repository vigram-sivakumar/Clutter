import { describe, expect, it } from 'vitest';
import type { PropertyType } from './Property.types';
import { propertyTypeRegistry } from './PropertyTypeRegistry';
import { iconRegistry } from '@shared/icon/iconRegistry';

const TYPES: PropertyType[] = ['text', 'date', 'tag', 'url', 'boolean', 'number', 'multi-select'];

describe('propertyTypeRegistry', () => {
  it('defines every type with a self-consistent entry and a real icon', () => {
    expect(Object.keys(propertyTypeRegistry).sort()).toEqual([...TYPES].sort());
    for (const type of TYPES) {
      const def = propertyTypeRegistry[type];
      expect(def.type).toBe(type);
      expect(def.label).not.toBe('');
      expect(def.icon in iconRegistry).toBe(true);
    }
  });

  it('gives date, tag and number dedicated icons', () => {
    expect(propertyTypeRegistry.date.icon).toBe('calendar');
    expect(propertyTypeRegistry.tag.icon).toBe('tag');
    expect(propertyTypeRegistry.number.icon).toBe('hash');
  });

  it('formats values per type', () => {
    expect(propertyTypeRegistry.date.format(null)).toBe('');
    expect(propertyTypeRegistry.date.format('not-a-date')).toBe('not-a-date');
    expect(propertyTypeRegistry.date.format('2026-01-02T03:04:05.000Z')).not.toBe('');
    expect(propertyTypeRegistry.tag.format(['a', 'b'])).toBe('a, b');
    expect(propertyTypeRegistry.boolean.format(true)).toBe('Yes');
    expect(propertyTypeRegistry.number.format(null)).toBe('');
    expect(propertyTypeRegistry.number.format(3)).toBe('3');
  });
});
