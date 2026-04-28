/**
 * Robustly extract a single JSON object from raw LLM output.
 *
 * Handles:
 * - Markdown code fences (```json ... ``` or just ``` ... ```)
 * - Preamble or trailing prose around the JSON
 * - Nested braces inside string literals (uses bracket-counting + string-aware skip)
 *
 * Throws a descriptive error including the first 500 chars of raw output if parsing
 * fails. This is the single largest debugging-time saver when LLMs hallucinate.
 */
export function extractJSON<T = unknown>(raw: string): T {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ExtractJSONError('LLM returned empty response.', raw);
  }

  const cleaned = stripFences(raw).trim();

  // Fast path: the whole thing is already JSON.
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // fall through to bracket-matching
  }

  const json = sliceFirstBalancedObject(cleaned);
  if (!json) {
    throw new ExtractJSONError('No JSON object found in LLM response.', raw);
  }

  try {
    return JSON.parse(json) as T;
  } catch (e) {
    throw new ExtractJSONError(
      `Failed to parse JSON: ${(e as Error).message}`,
      raw,
      json
    );
  }
}

export class ExtractJSONError extends Error {
  readonly raw: string;
  readonly attempted?: string;

  constructor(message: string, raw: string, attempted?: string) {
    const preview = truncate(raw, 500);
    super(`${message}\n\n--- raw response (first 500 chars) ---\n${preview}\n----------------------------------------`);
    this.name = 'ExtractJSONError';
    this.raw = raw;
    if (attempted !== undefined) this.attempted = attempted;
  }
}

function stripFences(s: string): string {
  // Remove ```json or ``` fences anywhere in the string.
  return s.replace(/```(?:json|JSON)?\s*/g, '').replace(/```/g, '');
}

/**
 * Find the first balanced top-level `{...}` object in the string,
 * accounting for braces inside string literals and escaped quotes.
 */
function sliceFirstBalancedObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n... (${s.length - max} more chars truncated)`;
}

/**
 * Run an async LLM call that's expected to return JSON. Retries up to `maxRetries`
 * times on ExtractJSONError (i.e. malformed output), with linear backoff.
 *
 * Network/HTTP errors are NOT retried here - those should be retried by the caller
 * with appropriate backoff strategy if needed.
 */
export async function withJSONRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 1
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!(e instanceof ExtractJSONError)) throw e;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}
