import { describe, expect, it } from 'vitest';
import {
  damerauLevenshtein, matchActivities, normalizeActivityName, validateActivityName
} from './activity';
import type { StudyActivity } from './types';

const activity = (id: string, name: string, archivedAt: number | null = null): StudyActivity => ({
  id, name, normalizedName: normalizeActivityName(name),
  createdAt: 1, updatedAt: 1, archivedAt
});

const catalog = [
  activity('1', 'Operating Systems'),
  activity('2', 'Operating System Design'),
  activity('3', 'Object-Oriented Programming'),
  activity('4', 'Algorithms'),
  activity('5', 'Database Systems'),
  activity('6', 'Discrete Mathematics')
];

describe('activity name normalization', () => {
  it.each([
    ['  Operating   Systems ', 'operating systems'],
    ['OPERATING SYSTEMS', 'operating systems'],
    ['Ｏｐｅｒａｔｉｎｇ Ｓｙｓｔｅｍｓ', 'operating systems'],
    ["Object–Oriented  Programming", 'object oriented programming'],
    ['Café', 'café'],
    ['  ', ''],
    ['C++', 'c++']
  ])('normalizes %j', (input, expected) => {
    expect(normalizeActivityName(input)).toBe(expected);
  });

  it('keeps meaningful programming-language symbols distinct', () => {\n    expect(normalizeActivityName('C#')).not.toBe(normalizeActivityName('C++'));\n  });\n\n  it('collapses whitespace without changing display spelling during validation', () => {
    expect(validateActivityName('  Linear   Algebra ')).toBe('Linear Algebra');
  });

  it.each(['', '   ', '!!!'])('rejects unusable name %j', (name) => {
    expect(() => validateActivityName(name)).toThrow();
  });

  it('rejects names longer than 80 characters', () => {
    expect(() => validateActivityName('a'.repeat(81))).toThrow(/80 characters/);
  });

  it('accepts an 80-character name', () => {
    expect(validateActivityName('a'.repeat(80))).toHaveLength(80);
  });
});

describe('Damerau-Levenshtein distance', () => {
  it('returns zero for identical strings and handles empty strings', () => {
    expect(damerauLevenshtein('same', 'same')).toBe(0);
    expect(damerauLevenshtein('', 'abc')).toBe(3);
    expect(damerauLevenshtein('abc', '')).toBe(3);
  });

  it('counts insertion, deletion, substitution, and adjacent transposition', () => {
    expect(damerauLevenshtein('cat', 'cart')).toBe(1);
    expect(damerauLevenshtein('cart', 'cat')).toBe(1);
    expect(damerauLevenshtein('cat', 'cut')).toBe(1);
    expect(damerauLevenshtein('form', 'from')).toBe(1);
  });
});

describe('activity matching', () => {
  it('returns exact normalized matches separately from suggestions', () => {
    expect(matchActivities(' OPERATING   SYSTEMS ', catalog)).toEqual({
      exact: catalog[0], suggestions: []
    });
  });

  it('ranks prefix matches before token and fuzzy matches', () => {
    const result = matchActivities('operating', catalog);
    expect(result.suggestions[0].activity.id).toBe('1');
    expect(result.suggestions[0].kind).toBe('prefix');
  });

  it('matches tokens when the query is not a full-name prefix', () => {
    const result = matchActivities('programming', catalog);
    expect(result.suggestions[0].activity.id).toBe('3');
    expect(result.suggestions[0].kind).toBe('token');
  });

  it('matches common typos using fuzzy distance', () => {
    const result = matchActivities('algoritms', catalog);
    expect(result.suggestions[0].activity.id).toBe('4');
    expect(result.suggestions[0].kind).toBe('fuzzy');
  });

  it('does not offer arbitrary fuzzy suggestions for short inputs', () => {
    expect(matchActivities('a', catalog).suggestions).toEqual([]);
    expect(matchActivities('db', catalog).suggestions).toEqual([]);
  });

  it('does not return archived activities', () => {
    const archived = activity('archived', 'Operating Systems', 10);
    expect(matchActivities('operating systems', [archived]).exact).toBeNull();
    expect(matchActivities('operating', [archived]).suggestions).toEqual([]);
  });

  it('returns no suggestions for empty input', () => {
    expect(matchActivities('   ', catalog)).toEqual({ exact: null, suggestions: [] });
  });

  it('limits suggestions to three by default and honors a custom limit', () => {
    const many = Array.from({ length: 8 }, (_, index) => activity(String(index), 'Programming ' + index));
    expect(matchActivities('programming', many).suggestions).toHaveLength(3);
    expect(matchActivities('programming', many, 5).suggestions).toHaveLength(5);
    expect(matchActivities('programming', many, 0).suggestions).toHaveLength(0);
  });

  it('uses stable alphabetical tie-breaking', () => {
    const values = [activity('z', 'Physics'), activity('a', 'Phonics')];
    expect(matchActivities('ph', values).suggestions.map((item) => item.activity.name))
      .toEqual(['Phonics', 'Physics']);
  });
});
