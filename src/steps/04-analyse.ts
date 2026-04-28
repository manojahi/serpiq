import type { LLMClient } from '../lib/llm.js';
import { extractJSON, withJSONRetry } from '../lib/json.js';
import type {
  AuditReport,
  BlogBrief,
  GSCReport,
  KeywordReport,
  ProductContext,
  PseoPlan,
  SiteStageDiagnosis,
} from '../types.js';

/**
 * Step 04 architecture:
 *
 * Small models (gpt-4o-mini, llama3, etc) cannot reliably follow a giant 250-line system prompt
 * with deeply nested schema. They collapse to the simplest schema they recognise.
 *
 * Solution: split into focused calls. Each blog brief gets its own LLM call. Each pSEO template
 * gets its own LLM call. Each call is small, focused, and produces a single deeply-detailed object.
 *
 * 1. runStrategicAudit() - main strategic call. Produces summary, score, top_3_actions,
 *    quick_fixes, content_improvements, internal_links, keyword_clusters, technical_issues,
 *    plus *seeds* for blog briefs and pSEO templates (just titles + targets).
 *
 * 2. expandBrief(seed) - in parallel for each blog seed, generate the full BlogBrief
 *    with all rich fields.
 *
 * 3. expandPseo(seed) - in parallel for each pSEO seed, generate the full PseoPlan
 *    with all rich fields.
 */

interface BriefSeed {
  title: string;
  target_keyword: string;
  search_intent: string;
  content_type: BlogBrief['content_type'];
  priority: 'high' | 'medium' | 'low';
  why_this_matters: string;
}

interface PseoSeed {
  template_name: string;
  status: 'expand_existing' | 'new_template';
  url_pattern: string;
  estimated_pages: number;
  target_keyword_template: string;
  data_source: string;
}

interface StrategicAuditOutput {
  summary: string;
  health_score: number;
  health_score_rationale: string;
  top_3_actions: string[];
  quick_fixes: AuditReport['quick_fixes'];
  content_improvements: AuditReport['content_improvements'];
  internal_links: AuditReport['internal_links'];
  keyword_clusters: AuditReport['keyword_clusters'];
  technical_issues: AuditReport['technical_issues'];
  blog_brief_seeds: BriefSeed[];
  pseo_seeds: PseoSeed[];
}

const STAGE_PLAYBOOKS: Record<string, string> = {
  increase_impressions:
    "PRIMARY GOAL: increase impressions. Most quick_fixes should be about creating new content, expanding pSEO, or fixing indexability. Don't suggest title rewrites for pages getting <10 impressions - they barely show up.",
  improve_ctr:
    "PRIMARY GOAL: improve CTR. 70% of quick_fixes MUST be specific title and meta description rewrites for pages with high impressions but low/zero clicks. Reference the exact queries those pages are showing for. Forbid: suggesting new pages until CTR improves.",
  rank_higher:
    'PRIMARY GOAL: rank higher. Focus on content depth, internal linking, and E-E-A-T signals. For each striking-distance keyword (pos 11-30), propose word-count expansion targets and missing sub-topics.',
  expand_winning_clusters:
    'PRIMARY GOAL: expand winning clusters. pseo_seeds should dominate - identify every working cluster and propose aggressive expansion (50-500 pages). Blog briefs reinforce the strongest clusters.',
  topical_authority:
    'PRIMARY GOAL: topical authority. Focus on refreshing aging content, building pillar-cluster relationships, and consolidating thin pSEO pages.',
};

function trimGSC(gsc: GSCReport | null): unknown {
  if (!gsc) return null;
  return {
    site: gsc.site,
    startDate: gsc.startDate,
    endDate: gsc.endDate,
    totals: {
      clicks: gsc.totalClicks,
      impressions: gsc.totalImpressions,
      avgCtr: Number(gsc.avgCtr.toFixed(4)),
      avgPosition: Number(gsc.avgPosition.toFixed(1)),
    },
    diagnosis: gsc.diagnosis,
    existingClusters: gsc.existingClusters.slice(0, 12),
    pagesWithQueries: gsc.pagesWithQueries.slice(0, 25),
    strikingDistance: gsc.strikingDistance.slice(0, 40),
    highImpressionLowCtr: gsc.highImpressionLowCtr.slice(0, 25),
    topQueriesOverall: gsc.topQueries.slice(0, 25).map(q => ({
      query: q.query,
      page: q.page,
      impressions: q.impressions,
      clicks: q.clicks,
      position: Number(q.position.toFixed(1)),
    })),
    decliningPages: gsc.decliningPages.slice(0, 15),
  };
}

function buildStageBlock(diagnosis: SiteStageDiagnosis | undefined): string {
  if (!diagnosis) return STAGE_PLAYBOOKS.increase_impressions;
  const playbook = STAGE_PLAYBOOKS[diagnosis.primary_goal] ?? STAGE_PLAYBOOKS.increase_impressions;
  return `STAGE: ${diagnosis.stage_label}
${playbook}
RATIONALE: ${diagnosis.rationale}`;
}

const STRATEGIC_SYSTEM_PROMPT = `You are a senior SEO strategist. Output ONLY valid JSON matching the exact schema below. No markdown fences, no preamble.

Be specific and data-driven. Every recommendation must reference a specific page, keyword, or metric from the input. Generic advice is forbidden.

Output minimums:
- quick_fixes: 10 items minimum
- content_improvements: 5 items minimum
- internal_links: 8 items minimum
- keyword_clusters: 4 minimum
- technical_issues: 5 minimum
- blog_brief_seeds: 6-10 items
- pseo_seeds: 2-5 items
- top_3_actions: exactly 3

Schema (return ONLY this JSON shape):

{
  "summary": "4-6 sentence executive summary leading with the stage diagnosis",
  "health_score": 0-100,
  "health_score_rationale": "1-2 sentences citing specific metrics",
  "top_3_actions": ["action 1", "action 2", "action 3"],
  "quick_fixes": [
    { "priority": "high|medium|low", "page": "/route", "issue": "specific with data", "fix": "specific action", "expected_impact": "quantified" }
  ],
  "content_improvements": [
    { "page": "/route", "current_issue": "", "suggested_title": "50-60 chars", "suggested_meta_description": "145-160 chars", "suggested_h1": "", "content_additions": ["section 1", "section 2"] }
  ],
  "internal_links": [
    { "from_page": "/source", "to_page": "/dest", "anchor_text": "specific", "reason": "data-backed" }
  ],
  "keyword_clusters": [
    { "cluster_name": "topic", "primary_page": "/page", "total_impressions": 0, "queries": [{"keyword": "", "position": 0, "impressions": 0}], "recommendation": "" }
  ],
  "technical_issues": [
    { "issue": "", "severity": "critical|warning|info", "fix": "" }
  ],
  "blog_brief_seeds": [
    {
      "title": "compelling click-worthy title",
      "target_keyword": "primary keyword",
      "search_intent": "informational|commercial|transactional|navigational",
      "content_type": "pillar|cluster|how_to|listicle|comparison|definition|case_study|review",
      "priority": "high|medium|low",
      "why_this_matters": "1-2 sentences citing GSC data or stage goal"
    }
  ],
  "pseo_seeds": [
    {
      "template_name": "",
      "status": "expand_existing|new_template",
      "url_pattern": "/category/[slug]",
      "estimated_pages": 0,
      "target_keyword_template": "{{Variable}} keyword",
      "data_source": "specific source"
    }
  ]
}`;

async function runStrategicAudit(
  product: ProductContext,
  gsc: GSCReport | null,
  keywords: KeywordReport,
  llm: LLMClient
): Promise<StrategicAuditOutput> {
  const stageBlock = buildStageBlock(gsc?.diagnosis);
  const userPrompt = `${stageBlock}

# Product
${JSON.stringify(product, null, 2)}

# GSC Data
${gsc ? JSON.stringify(trimGSC(gsc), null, 2) : '(skipped - assume no_data stage, focus on increase_impressions)'}

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

EXISTING pSEO CLUSTERS to prioritise expanding: ${gsc?.existingClusters?.map(c => `${c.pattern} (${c.pageCount} pages, ${c.totalImpressions} impr)`).join(', ') || 'none'}

Lead summary with the stage. Reference specific numbers throughout. Output JSON ONLY.`;

  const raw = await llm.complete(userPrompt, STRATEGIC_SYSTEM_PROMPT, { jsonMode: true });
  const parsed = extractJSON(raw) as StrategicAuditOutput;

  parsed.quick_fixes ??= [];
  parsed.content_improvements ??= [];
  parsed.internal_links ??= [];
  parsed.keyword_clusters ??= [];
  parsed.technical_issues ??= [];
  parsed.top_3_actions ??= [];
  parsed.blog_brief_seeds ??= [];
  parsed.pseo_seeds ??= [];
  parsed.health_score_rationale ??= '';
  parsed.health_score = Math.max(0, Math.min(100, Math.round(parsed.health_score ?? 50)));
  return parsed;
}

const BRIEF_SYSTEM_PROMPT = `You are a senior SEO content strategist creating a single, production-ready blog brief that a writer can hand off to the developer/CMS without further research.

Output ONLY valid JSON matching the schema. No fences, no preamble.

QUALITY BARS (your brief is rejected if any of these fail):
- meta_title is 50-60 characters and contains the target keyword
- meta_description is 145-160 characters and contains target keyword + a benefit + a CTA
- slug is 3-5 lowercase hyphen-separated words
- secondary_keywords contains 4-6 semantic variants and long-tails
- featured_snippet_target.answer_template is a 40-60 word snippet-ready answer (or {} if type is "none")
- outline has 7-10 sections, each with heading + 4-6 bullets + word_target (sum of word_targets equals estimated_word_count, ±100)
- faq has 5-7 question/answer pairs (40-80 words per answer)
- internal_links has 4-6 entries with descriptive anchor text
- external_authority_links has 2-4 entries (specific authority domains: vendor docs, .gov/.edu, well-known studies)
- image_suggestions has 3-5 entries with placement and SEO-optimised alt text
- schema_markup includes at minimum ["Article", "BreadcrumbList"], plus "FAQPage" if FAQ present, plus "HowTo" if content_type is how_to
- estimated_word_count is realistic for the content_type (1200-2500 for cluster, 2500-4500 for pillar, 1500-3000 for how_to/listicle, 1800-3500 for comparison)

Schema:

{
  "title": "H1 of the article (compelling, click-worthy)",
  "meta_title": "<title> tag, 50-60 chars",
  "meta_description": "145-160 chars",
  "slug": "url-slug-3-to-5-words",
  "target_keyword": "exact match primary",
  "secondary_keywords": ["4-6 variants"],
  "search_intent": "informational|commercial|transactional|navigational",
  "content_type": "pillar|cluster|how_to|listicle|comparison|definition|case_study|review",
  "why_this_matters": "1-2 sentences",
  "featured_snippet_target": { "type": "paragraph|list|table|none", "query": "exact query", "answer_template": "40-60 word answer" },
  "outline": [
    { "heading": "section name", "bullets": ["sub-point 1", "sub-point 2", "sub-point 3", "sub-point 4"], "word_target": 250 }
  ],
  "faq": [{ "question": "natural-language question", "short_answer": "40-80 word answer" }],
  "internal_links": [{ "from_or_to": "/some/page", "anchor": "specific anchor text" }],
  "external_authority_links": [{ "domain": "stripe.com", "reason": "specific data point or doc to cite" }],
  "image_suggestions": [{ "description": "what to depict", "alt_text": "SEO alt text", "placement": "hero|inline|comparison-table|infographic" }],
  "schema_markup": ["Article", "FAQPage", "BreadcrumbList"],
  "estimated_word_count": 0,
  "priority": "high|medium|low"
}`;

async function expandBrief(
  seed: BriefSeed,
  product: ProductContext,
  gsc: GSCReport | null,
  llm: LLMClient
): Promise<BlogBrief> {
  const productPages = product.existing_pages.slice(0, 30);
  const existingClusters = gsc?.existingClusters?.slice(0, 6) ?? [];
  const relevantQueries = (gsc?.topQueries ?? [])
    .filter(q => q.query.toLowerCase().includes(seed.target_keyword.toLowerCase().split(' ')[0] || ''))
    .slice(0, 8);

  const userPrompt = `Create a production-ready blog brief for this seed:

SEED:
${JSON.stringify(seed, null, 2)}

PRODUCT CONTEXT:
- Name: ${product.product_name}
- Description: ${product.product_description}
- Category: ${product.product_category}
- Target audience: ${product.target_audience.join(', ')}
- Core features: ${product.core_features.join(', ')}

EXISTING SITE PAGES (for internal_links):
${productPages.map(p => `- ${p}`).join('\n')}

EXISTING pSEO CLUSTERS (link these from the brief where relevant):
${existingClusters.map(c => `- ${c.pattern} (${c.pageCount} pages)`).join('\n') || '(none)'}

${relevantQueries.length > 0 ? `RELATED QUERIES FROM GSC (use as secondary_keywords or FAQ inspiration):
${relevantQueries.map(q => `- "${q.query}" (${q.impressions} impr, pos ${q.position.toFixed(1)})`).join('\n')}` : ''}

Generate the FULL brief with:
- meta_title (50-60 chars), meta_description (145-160), slug
- 4-6 secondary_keywords
- featured_snippet_target with 40-60 word answer
- 7-10 outline sections each with 4-6 bullets and word_target
- 5-7 FAQ entries
- 4-6 internal_links to existing pages above
- 2-4 external_authority_links to specific authority domains for this niche
- 3-5 image_suggestions with placement and alt text
- schema_markup array

Return ONLY the JSON object. No fences.`;

  const raw = await llm.complete(userPrompt, BRIEF_SYSTEM_PROMPT, { jsonMode: true });
  const brief = extractJSON(raw) as BlogBrief;

  brief.title ??= seed.title;
  brief.target_keyword ??= seed.target_keyword;
  brief.search_intent ??= seed.search_intent;
  brief.content_type ??= seed.content_type;
  brief.priority ??= seed.priority;
  brief.why_this_matters ??= seed.why_this_matters;
  brief.secondary_keywords ??= [];
  brief.faq ??= [];
  brief.internal_links ??= [];
  brief.external_authority_links ??= [];
  brief.image_suggestions ??= [];
  brief.schema_markup ??= ['Article', 'BreadcrumbList'];
  brief.meta_title ??= brief.title;
  brief.meta_description ??= '';
  brief.slug ??= seed.target_keyword
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .slice(0, 5)
    .join('-');
  brief.featured_snippet_target ??= { type: 'none', query: '', answer_template: '' };
  brief.outline ??= [];
  brief.estimated_word_count ??= 1500;
  if (Array.isArray(brief.outline) && brief.outline.length > 0 && typeof brief.outline[0] === 'string') {
    brief.outline = (brief.outline as unknown as string[]).map(s => ({ heading: s, bullets: [] }));
  }
  return brief;
}

const PSEO_SYSTEM_PROMPT = `You are a senior SEO + product engineer designing a programmatic SEO template that a developer can implement directly. You produce specifications, not vague advice.

Output ONLY valid JSON matching the schema. No fences, no preamble.

QUALITY BARS:
- meta_title_template, meta_description_template, h1_template all use {{Variable}} placeholders that match real fields the developer can interpolate
- target_keyword_template includes a {{Variable}} placeholder
- example_pages contains 3-5 fully-formed URLs (paths) showing what real generated pages will look like
- required_sections has 5-8 entries: each with section name, min_words, and a clear purpose (FAQ schema win, comparison snippet win, etc)
- thin_content_guards has 4-6 specific rules (e.g. "Skip variants where source row has fewer than 5 fields populated")
- internal_linking_strategy is 2-4 sentences describing the hub-and-spoke or sibling-link pattern with specific anchor variation
- launch_checklist has 8-12 ordered, actionable steps (build template, write evergreen intro, sitemap, schema validation, launch in batches, monitor)
- schema_markup includes the right schema types for the content (Article, BreadcrumbList minimum; FAQPage if FAQ section, HowTo if step-by-step, Product/SoftwareApplication if applicable)
- implementation_notes is 2-4 sentences with tech-specific guidance (ISR vs SSG, caching, data fetching)

Schema:

{
  "template_name": "",
  "status": "expand_existing|new_template",
  "url_pattern": "/category/[slug]",
  "target_keyword_template": "{{Variable}} alternative",
  "meta_title_template": "{{Variable}} alternative for {{audience}} | Brand",
  "meta_description_template": "Learn how to {{action}} with {{Variable}}. 145-160 chars including CTA.",
  "h1_template": "{{Variable}} alternative",
  "estimated_pages": 0,
  "data_source": "specific source: e.g. existing decline_codes table joined with Stripe error reference",
  "example_pages": ["/category/example-1", "/category/example-2", "/category/example-3"],
  "required_sections": [
    { "section": "Hero with definition", "min_words": 80, "purpose": "match informational intent above the fold" },
    { "section": "Comparison table", "min_words": 100, "purpose": "win table snippet" },
    { "section": "Step-by-step guide", "min_words": 250, "purpose": "depth signal + HowTo schema" },
    { "section": "FAQ", "min_words": 200, "purpose": "FAQPage schema + PAA capture" },
    { "section": "Related pages", "min_words": 50, "purpose": "internal linking to cluster" }
  ],
  "schema_markup": ["Article", "FAQPage", "BreadcrumbList"],
  "unique_content_per_page": "what specifically varies per page",
  "thin_content_guards": [
    "Every page must have minimum 600 unique words",
    "Skip pages with <50 monthly searches",
    "Auto-generate sections only when source data has 5+ rows",
    "60% of content must be unique per page (not boilerplate)"
  ],
  "internal_linking_strategy": "Specific link pattern with anchor variation",
  "launch_checklist": [
    "Build template component with variable interpolation",
    "Write 600-word evergreen intro per page",
    "Add to sitemap.xml and submit to GSC",
    "Validate schema in Rich Results Test",
    "Launch first 10-50 pages, link from main nav",
    "Monitor indexing rate weekly"
  ],
  "implementation_notes": "Tech-specific notes"
}`;

async function expandPseo(
  seed: PseoSeed,
  product: ProductContext,
  gsc: GSCReport | null,
  llm: LLMClient
): Promise<PseoPlan> {
  const matchingCluster = gsc?.existingClusters?.find(c => seed.url_pattern.startsWith(c.pattern.replace('/*', '')));
  const userPrompt = `Create a production-ready pSEO template specification for this seed:

SEED:
${JSON.stringify(seed, null, 2)}

PRODUCT CONTEXT:
- Name: ${product.product_name}
- Description: ${product.product_description}
- Category: ${product.product_category}
- Tech stack: ${product.tech_stack.join(', ')}
- Target audience: ${product.target_audience.join(', ')}

${matchingCluster ? `EXISTING CLUSTER MATCH (this is an expansion of):
- Pattern: ${matchingCluster.pattern}
- Current pages: ${matchingCluster.pageCount}
- Current impressions: ${matchingCluster.totalImpressions}
- Example pages: ${matchingCluster.examplePages.join(', ')}` : ''}

EXISTING SITE PAGES:
${product.existing_pages.slice(0, 20).map(p => `- ${p}`).join('\n')}

Generate the FULL pSEO specification with:
- meta_title_template, meta_description_template, h1_template (with {{Variable}} placeholders)
- 3-5 fully-formed example URL paths
- 5-8 required_sections with min_words and purpose
- 4-6 thin_content_guards
- 8-12 launch_checklist steps
- internal_linking_strategy (specific anchor pattern)
- schema_markup array (right types for this content)
- implementation_notes specific to ${product.tech_stack.join(', ')}

Return ONLY the JSON object. No fences.`;

  const raw = await llm.complete(userPrompt, PSEO_SYSTEM_PROMPT, { jsonMode: true });
  const plan = extractJSON(raw) as PseoPlan;

  plan.template_name ??= seed.template_name;
  plan.status ??= seed.status;
  plan.url_pattern ??= seed.url_pattern;
  plan.estimated_pages ??= seed.estimated_pages;
  plan.target_keyword_template ??= seed.target_keyword_template;
  plan.data_source ??= seed.data_source;
  plan.example_pages ??= [];
  plan.required_sections ??= [];
  plan.schema_markup ??= ['Article', 'BreadcrumbList'];
  plan.thin_content_guards ??= [];
  plan.launch_checklist ??= [];
  plan.unique_content_per_page ??= '';
  plan.meta_title_template ??= '';
  plan.meta_description_template ??= '';
  plan.h1_template ??= '';
  plan.internal_linking_strategy ??= '';
  plan.implementation_notes ??= '';
  return plan;
}

export interface AnalyseSEOProgress {
  onStrategicComplete?: (result: StrategicAuditOutput) => void;
  onBriefStart?: (index: number, total: number, title: string) => void;
  onBriefComplete?: (index: number, total: number, title: string) => void;
  onPseoStart?: (index: number, total: number, name: string) => void;
  onPseoComplete?: (index: number, total: number, name: string) => void;
}

export async function analyseSEO(
  product: ProductContext,
  gsc: GSCReport | null,
  keywords: KeywordReport,
  llm: LLMClient,
  progress?: AnalyseSEOProgress
): Promise<AuditReport> {
  const strategy = await runStrategicAudit(product, gsc, keywords, llm);
  progress?.onStrategicComplete?.(strategy);

  const briefSeeds = strategy.blog_brief_seeds.slice(0, 10);
  const pseoSeeds = strategy.pseo_seeds.slice(0, 5);

  const briefPromises = briefSeeds.map(async (seed, i) => {
    progress?.onBriefStart?.(i, briefSeeds.length, seed.title);
    try {
      const brief = await withJSONRetry(() => expandBrief(seed, product, gsc, llm));
      progress?.onBriefComplete?.(i, briefSeeds.length, seed.title);
      return brief;
    } catch {
      progress?.onBriefComplete?.(i, briefSeeds.length, seed.title);
      return seedToFallbackBrief(seed);
    }
  });

  const pseoPromises = pseoSeeds.map(async (seed, i) => {
    progress?.onPseoStart?.(i, pseoSeeds.length, seed.template_name);
    try {
      const plan = await withJSONRetry(() => expandPseo(seed, product, gsc, llm));
      progress?.onPseoComplete?.(i, pseoSeeds.length, seed.template_name);
      return plan;
    } catch {
      progress?.onPseoComplete?.(i, pseoSeeds.length, seed.template_name);
      return seedToFallbackPseo(seed);
    }
  });

  const [blogBriefs, pseoPlans] = await Promise.all([
    Promise.all(briefPromises),
    Promise.all(pseoPromises),
  ]);

  return {
    summary: strategy.summary,
    health_score: strategy.health_score,
    health_score_rationale: strategy.health_score_rationale,
    top_3_actions: strategy.top_3_actions,
    quick_fixes: strategy.quick_fixes,
    content_improvements: strategy.content_improvements,
    blog_briefs: blogBriefs,
    pseo_plan: pseoPlans,
    internal_links: strategy.internal_links,
    keyword_clusters: strategy.keyword_clusters,
    technical_issues: strategy.technical_issues,
  };
}

function seedToFallbackBrief(seed: BriefSeed): BlogBrief {
  return {
    title: seed.title,
    meta_title: seed.title.slice(0, 60),
    meta_description: '',
    slug: seed.target_keyword
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .split('-')
      .slice(0, 5)
      .join('-'),
    target_keyword: seed.target_keyword,
    secondary_keywords: [],
    search_intent: seed.search_intent,
    content_type: seed.content_type,
    why_this_matters: seed.why_this_matters,
    featured_snippet_target: { type: 'none', query: '', answer_template: '' },
    outline: [],
    faq: [],
    internal_links: [],
    external_authority_links: [],
    image_suggestions: [],
    schema_markup: ['Article', 'BreadcrumbList'],
    estimated_word_count: 1500,
    priority: seed.priority,
  };
}

function seedToFallbackPseo(seed: PseoSeed): PseoPlan {
  return {
    template_name: seed.template_name,
    status: seed.status,
    url_pattern: seed.url_pattern,
    target_keyword_template: seed.target_keyword_template,
    meta_title_template: '',
    meta_description_template: '',
    h1_template: '',
    estimated_pages: seed.estimated_pages,
    data_source: seed.data_source,
    example_pages: [],
    required_sections: [],
    schema_markup: ['Article', 'BreadcrumbList'],
    unique_content_per_page: '',
    thin_content_guards: [],
    internal_linking_strategy: '',
    launch_checklist: [],
    implementation_notes: '',
  };
}
