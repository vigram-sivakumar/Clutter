/**
 * Tests for dateParser utility
 * Testing: Date parsing for @ mentions (natural language dates)
 */

import { describe, it, expect } from 'vitest';
import { parseDynamicDate, filterDateSuggestions } from './dateParser';

describe('dateParser', () => {
  describe('parseDynamicDate', () => {
    it('should parse forward day offsets (e.g., "3days")', () => {
      const result = parseDynamicDate('3days');
      
      expect(result).toBeDefined();
      expect(result?.keywords).toEqual(['3days']);
      
      // Verify the date is 3 days from now
      const today = new Date();
      const expected = new Date(today);
      expected.setDate(expected.getDate() + 3);
      const expectedISO = expected.toISOString().split('T')[0];
      
      expect(result?.date).toBe(expectedISO);
    });

    it('should parse forward week offsets (e.g., "2weeks")', () => {
      const result = parseDynamicDate('2weeks');
      
      expect(result).toBeDefined();
      expect(result?.keywords).toEqual(['2weeks']);
      
      // Verify the date is 14 days (2 weeks) from now
      const today = new Date();
      const expected = new Date(today);
      expected.setDate(expected.getDate() + 14);
      const expectedISO = expected.toISOString().split('T')[0];
      
      expect(result?.date).toBe(expectedISO);
    });

    it('should parse backward day offsets (e.g., "3daysago")', () => {
      const result = parseDynamicDate('3daysago');
      
      expect(result).toBeDefined();
      expect(result?.keywords).toEqual(['3daysago']);
      
      // Verify the date is 3 days ago
      const today = new Date();
      const expected = new Date(today);
      expected.setDate(expected.getDate() - 3);
      const expectedISO = expected.toISOString().split('T')[0];
      
      expect(result?.date).toBe(expectedISO);
    });

    it('should parse backward week offsets (e.g., "1weekago")', () => {
      const result = parseDynamicDate('1weekago');
      
      expect(result).toBeDefined();
      expect(result?.keywords).toEqual(['1weekago']);
      
      // Verify the date is 7 days ago
      const today = new Date();
      const expected = new Date(today);
      expected.setDate(expected.getDate() - 7);
      const expectedISO = expected.toISOString().split('T')[0];
      
      expect(result?.date).toBe(expectedISO);
    });

    it('should handle spaces in input (e.g., "3 days")', () => {
      const result = parseDynamicDate('3 days');
      
      expect(result).toBeDefined();
      expect(result?.keywords).toEqual(['3days']); // normalized
    });

    it('should handle plural forms (e.g., "1day" vs "1days")', () => {
      const singular = parseDynamicDate('1day');
      const plural = parseDynamicDate('1days');
      
      expect(singular).toBeDefined();
      expect(plural).toBeDefined();
      expect(singular?.date).toBe(plural?.date);
    });

    it('should return null for invalid patterns', () => {
      expect(parseDynamicDate('notadate')).toBeNull();
      expect(parseDynamicDate('xyz')).toBeNull();
      expect(parseDynamicDate('123')).toBeNull();
      expect(parseDynamicDate('')).toBeNull();
    });

    it('should return null for incomplete patterns (e.g., "days" without number)', () => {
      expect(parseDynamicDate('days')).toBeNull();
      expect(parseDynamicDate('weeks')).toBeNull();
      expect(parseDynamicDate('ago')).toBeNull();
    });
  });

  describe('filterDateSuggestions', () => {
    it('should return only "Today" for empty query', () => {
      const results = filterDateSuggestions('');
      
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('Today');
    });

    it('should match "today" keyword', () => {
      const results = filterDateSuggestions('today');
      
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('Today');
    });

    it('should match "tomorrow" keyword', () => {
      const results = filterDateSuggestions('tomorrow');
      
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('Tomorrow');
    });

    it('should match "yesterday" keyword', () => {
      const results = filterDateSuggestions('yesterday');
      
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('Yesterday');
    });

    it('should support partial matching (e.g., "tom" → "Tomorrow")', () => {
      const results = filterDateSuggestions('tom');
      
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('Tomorrow');
    });

    it('should parse dynamic dates (e.g., "5days")', () => {
      const results = filterDateSuggestions('5days');
      
      expect(results).toHaveLength(1);
      expect(results[0].keywords).toEqual(['5days']);
    });

    it('should return empty array for completely invalid queries', () => {
      const results = filterDateSuggestions('xyzabc123notadate');
      
      // Should return empty array for no matches
      expect(results).toEqual([]);
    });

    it('should be case insensitive', () => {
      const lowerResults = filterDateSuggestions('tomorrow');
      const upperResults = filterDateSuggestions('TOMORROW');
      const mixedResults = filterDateSuggestions('ToMoRrOw');
      
      expect(lowerResults[0].label).toBe(upperResults[0].label);
      expect(lowerResults[0].label).toBe(mixedResults[0].label);
    });
  });
});
