import type { LLMClient } from '../lib/llm.js';
import { extractJSON } from '../lib/json.js';
import type { GSCReport, KeywordReport, ProductContext } from '../types.js';

const SYSTEM_PROMPT = `You are an expert SEO and keyword researcher. Generate a keyword research report based on the product and existing keyword performance data.`;

function userPrompt(product: ProductContext, gsc: GSCReport | null, autocomplete: { seed: string; suggestions: string[] }[]): string {
  const strikingDistance = (gsc?.strikingDistance ?? [])
    .slice(0, 30)
    .map(q => `- "${q.query}" (pos ${q.position.toFixed(1)}, ${q.impressions} impr)`)
    .join('\n');

  const autocompleteBlock = autocomplete
    .slice(0, 10)
    .map(a => `Seed: ${a.seed}\n  ${a.suggestions.slice(0, 10).join('\n  ')}`)
    .join('\n');

  return `Product context:
${JSON.stringify(product, null, 2)}

Real keywords already getting impressions in Google Search Console (last 90 days, position 8–20):
${strikingDistance || '(none; site has no GSC data yet)'}

Google Autocomplete suggestions for seed keywords:
${autocompleteBlock || '(none collected)'}

Generate a keyword research report as JSON:
{
  "quick_wins": [{ "keyword": "", "intent": "informational|transactional|navigational", "rationale": "" }],
  "blog_opportunities": [{ "keyword": "", "title": "", "intent": "" }],
  "pseo_templates": [{ "template": "e.g. best {tool} for {use_case}", "estimated_pages": 0, "example_pages": [""] }],
  "competitor_gaps": [{ "keyword": "", "why": "" }]
}

Be specific to this product. Reference real keywords from GSC where possible. Aim for 8–15 quick wins, 5–10 blog opportunities, 2–5 pSEO templates, 5–10 competitor gaps. Return ONLY valid JSON.`;
}

async function fetchAutocomplete(seed: string): Promise<string[]> {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(seed)}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as [string, string[]];
    return Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
  } catch {
    return [];
  }
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export async function researchKeywords(
  product: ProductContext,
  gsc: GSCReport | null,
  llm: LLMClient
): Promise<KeywordReport> {
  const seeds = [...new Set([...(product.initial_keyword_seeds ?? []), ...(gsc?.strikingDistance ?? []).slice(0, 5).map(q => q.query)])].slice(0, 10);

  const autocomplete: { seed: string; suggestions: string[] }[] = [];
  for (const seed of seeds) {
    if (!seed) continue;
    const suggestions = await fetchAutocomplete(seed);
    autocomplete.push({ seed, suggestions });
    await sleep(500);
  }

  const raw = await llm.complete(userPrompt(product, gsc, autocomplete), SYSTEM_PROMPT);

  const parsed = extractJSON(raw) as Omit<KeywordReport, 'autocomplete_suggestions'>;

  return {
    autocomplete_suggestions: autocomplete,
    quick_wins: parsed.quick_wins ?? [],
    blog_opportunities: parsed.blog_opportunities ?? [],
    pseo_templates: parsed.pseo_templates ?? [],
    competitor_gaps: parsed.competitor_gaps ?? [],
  };
}
