import { describe, it, expect } from 'vitest';
import { extractJSON, ExtractJSONError, withJSONRetry } from '../src/lib/json.js';

describe('extractJSON', () => {
  it('parses plain JSON', () => {
    expect(extractJSON('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in ```json fences', () => {
    const raw = '```json\n{"score":42,"label":"ok"}\n```';
    expect(extractJSON(raw)).toEqual({ score: 42, label: 'ok' });
  });

  it('parses JSON wrapped in plain ``` fences', () => {
    expect(extractJSON('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('strips preamble and trailing text', () => {
    const raw = 'Here is the result:\n{"foo":"bar"}\nLet me know if you need anything else.';
    expect(extractJSON(raw)).toEqual({ foo: 'bar' });
  });

  it('handles braces inside string values without breaking', () => {
    const raw = '{"template": "Hello {name}, welcome to {{place}}", "ok": true}';
    expect(extractJSON(raw)).toEqual({
      template: 'Hello {name}, welcome to {{place}}',
      ok: true,
    });
  });

  it('handles escaped quotes inside strings', () => {
    const raw = '{"q": "she said \\"hi\\" then left", "n": 1}';
    expect(extractJSON(raw)).toEqual({ q: 'she said "hi" then left', n: 1 });
  });

  it('parses deeply nested objects', () => {
    const raw = '{"a": {"b": {"c": {"d": [1,2,{"e":"f"}]}}}}';
    expect(extractJSON(raw)).toEqual({ a: { b: { c: { d: [1, 2, { e: 'f' }] } } } });
  });

  it('throws ExtractJSONError on empty input', () => {
    expect(() => extractJSON('')).toThrow(ExtractJSONError);
    expect(() => extractJSON('   ')).toThrow(ExtractJSONError);
  });

  it('throws ExtractJSONError when no object is found', () => {
    expect(() => extractJSON('just plain prose, no json')).toThrow(ExtractJSONError);
  });

  it('throws ExtractJSONError on syntactically broken JSON', () => {
    expect(() => extractJSON('{"a": 1, "b":}')).toThrow(ExtractJSONError);
  });

  it('error message includes a preview of the raw response', () => {
    try {
      extractJSON('totally not json at all');
    } catch (e) {
      expect(e).toBeInstanceOf(ExtractJSONError);
      expect((e as Error).message).toContain('totally not json');
    }
  });

  it('supports generic typing', () => {
    const r = extractJSON<{ score: number }>('{"score": 99}');
    expect(r.score).toBe(99);
  });
});

describe('withJSONRetry', () => {
  it('returns immediately on success', async () => {
    let calls = 0;
    const r = await withJSONRetry(async () => {
      calls++;
      return 'ok';
    });
    expect(r).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries on ExtractJSONError', async () => {
    let calls = 0;
    const r = await withJSONRetry(async () => {
      calls++;
      if (calls < 2) throw new ExtractJSONError('bad', 'raw');
      return 'ok';
    }, 2);
    expect(r).toBe('ok');
    expect(calls).toBe(2);
  });

  it('does not retry on non-ExtractJSONError', async () => {
    let calls = 0;
    await expect(
      withJSONRetry(async () => {
        calls++;
        throw new Error('network');
      })
    ).rejects.toThrow('network');
    expect(calls).toBe(1);
  });

  it('throws last error after exhausting retries', async () => {
    let calls = 0;
    await expect(
      withJSONRetry(async () => {
        calls++;
        throw new ExtractJSONError('bad', 'raw');
      }, 2)
    ).rejects.toBeInstanceOf(ExtractJSONError);
    expect(calls).toBe(3);
  });
});
