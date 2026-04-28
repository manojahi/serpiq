import type { LLMClient } from '../lib/llm.js';
import { extractJSON } from '../lib/json.js';
import type { AuditReport, GSCReport, KeywordReport, ProductContext } from '../types.js';

const SYSTEM_PROMPT = `You are a senior SEO strategist. You have been given:
1. A product summary extracted from the codebase
2. Real Google Search Console performance data (last 90 days), or none if GSC was skipped
3. A keyword research report

Produce a comprehensive SEO audit and action plan as JSON:

{
  "summary": "3-4 sentence executive summary of current SEO health",
  "health_score": 0-100,
  "quick_fixes": [
    {
      "priority": "high|medium|low",
      "page": "URL or route",
      "issue": "description of problem",
      "fix": "specific actionable fix",
      "expected_impact": "description"
    }
  ],
  "content_improvements": [
    {
      "page": "",
      "current_issue": "",
      "suggested_title": "",
      "suggested_meta_description": "",
      "suggested_h1": "",
      "content_additions": [""]
    }
  ],
  "blog_briefs": [
    {
      "title": "",
      "target_keyword": "",
      "search_intent": "",
      "outline": [""],
      "estimated_word_count": 0,
      "priority": "high|medium|low"
    }
  ],
  "pseo_plan": [
    {
      "template_name": "",
      "url_pattern": "/category/[slug]",
      "target_keyword_template": "",
      "estimated_pages": 0,
      "data_source": "where would the data for these pages come from",
      "example_pages": [""],
      "implementation_notes": ""
    }
  ],
  "technical_issues": [
    {
      "issue": "",
      "severity": "critical|warning|info",
      "fix": ""
    }
  ]
}

Be specific. Reference actual pages, actual keywords, actual GSC data points. Return ONLY valid JSON.`;

function trimGSC(gsc: GSCReport | null): unknown {
  if (!gsc) return null;
  return {
    site: gsc.site,
    startDate: gsc.startDate,
    endDate: gsc.endDate,
    totalClicks: gsc.totalClicks,
    totalImpressions: gsc.totalImpressions,
    avgCtr: gsc.avgCtr,
    avgPosition: gsc.avgPosition,
    topQueries: gsc.topQueries.slice(0, 25),
    topPages: gsc.topPages.slice(0, 25),
    strikingDistance: gsc.strikingDistance.slice(0, 30),
    highImpressionLowCtr: gsc.highImpressionLowCtr.slice(0, 20),
    decliningPages: gsc.decliningPages.slice(0, 15),
  };
}

export async function analyseSEO(
  product: ProductContext,
  gsc: GSCReport | null,
  keywords: KeywordReport,
  llm: LLMClient
): Promise<AuditReport> {
  const userPrompt = `# Product Context
${JSON.stringify(product, null, 2)}

# Google Search Console Data
${gsc ? JSON.stringify(trimGSC(gsc), null, 2) : '(GSC was skipped or unavailable; base your audit on product context and keyword research only)'}

# Keyword Research
${JSON.stringify(
  {
    quick_wins: keywords.quick_wins,
    blog_opportunities: keywords.blog_opportunities,
    pseo_templates: keywords.pseo_templates,
    competitor_gaps: keywords.competitor_gaps,
  },
  null,
  2
)}

Produce the comprehensive SEO audit and action plan in the exact JSON shape described in the system prompt. Return ONLY valid JSON.`;

  const raw = await llm.complete(userPrompt, SYSTEM_PROMPT);

  const parsed = extractJSON(raw) as AuditReport;
  parsed.quick_fixes ??= [];
  parsed.content_improvements ??= [];
  parsed.blog_briefs ??= [];
  parsed.pseo_plan ??= [];
  parsed.technical_issues ??= [];
  parsed.health_score = Math.max(0, Math.min(100, Math.round(parsed.health_score ?? 50)));
  return parsed;
}
