import { describe, it, expect } from 'vitest';
import { slugify, takeLines, todayISO } from '../src/lib/fs.js';

describe('slugify', () => {
  it('lowercases and replaces non-alphanumeric with dashes', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
  });

  it('collapses multiple separators into one dash', () => {
    expect(slugify('a   b___c--d')).toBe('a-b-c-d');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('---hello---')).toBe('hello');
  });

  it('truncates to 60 characters', () => {
    const long = 'a'.repeat(120);
    expect(slugify(long).length).toBe(60);
  });

  it('handles unicode by stripping it', () => {
    expect(slugify('café résumé naïve')).toBe('caf-r-sum-na-ve');
  });

  it('returns empty string for input with no alphanumeric chars', () => {
    expect(slugify('!!!---***')).toBe('');
  });
});

describe('takeLines', () => {
  it('returns first n lines', () => {
    expect(takeLines('a\nb\nc\nd', 2)).toBe('a\nb');
  });

  it('handles fewer lines than requested', () => {
    expect(takeLines('only one', 5)).toBe('only one');
  });

  it('handles CRLF line endings', () => {
    expect(takeLines('a\r\nb\r\nc', 2)).toBe('a\nb');
  });
});

describe('todayISO', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
