export interface ProductContext {
  product_name: string;
  product_description: string;
  product_category: string;
  target_audience: string[];
  core_features: string[];
  tech_stack: string[];
  existing_pages: string[];
  content_gaps: string[];
  initial_keyword_seeds: string[];
}

export interface GSCQueryRow {
  query: string;
  page?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCPageRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface PageCluster {
  pattern: string;
  pageCount: number;
  totalImpressions: number;
  totalClicks: number;
  avgPosition: number;
  examplePages: string[];
}

export interface PageWithQueries {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQueries: { query: string; impressions: number; clicks: number; position: number }[];
}

export type SiteStage =
  | 'no_data'
  | 'low_visibility'
  | 'visibility_no_clicks'
  | 'rank_improvement'
  | 'has_traction'
  | 'scaling';

export type PrimaryGoal =
  | 'increase_impressions'
  | 'improve_ctr'
  | 'rank_higher'
  | 'expand_winning_clusters'
  | 'topical_authority';

export interface SiteStageDiagnosis {
  stage: SiteStage;
  stage_label: string;
  primary_goal: PrimaryGoal;
  primary_goal_label: string;
  secondary_goals: string[];
  rationale: string;
  signals: {
    pagesWithImpressions: number;
    pagesInTop10: number;
    pagesInTop20: number;
    pagesWithImpressionsNoClicks: number;
    pagesPositionGreater30: number;
  };
}

export interface GSCReport {
  site: string;
  startDate: string;
  endDate: string;
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
  topQueries: GSCQueryRow[];
  topPages: GSCPageRow[];
  pagesWithQueries: PageWithQueries[];
  strikingDistance: GSCQueryRow[];
  highImpressionLowCtr: GSCQueryRow[];
  decliningPages: { page: string; previousImpressions: number; recentImpressions: number; deltaPct: number }[];
  existingClusters: PageCluster[];
  thresholds: {
    strikingMinImpressions: number;
    lowCtrMinImpressions: number;
    lowCtrMaxCtr: number;
  };
  diagnosis: SiteStageDiagnosis;
}

export interface KeywordOpportunity {
  keyword: string;
  intent: 'informational' | 'transactional' | 'navigational';
  rationale: string;
}

export interface BlogOpportunity {
  keyword: string;
  title: string;
  intent: string;
}

export interface PseoTemplate {
  template: string;
  estimated_pages: number;
  example_pages: string[];
}

export interface CompetitorGap {
  keyword: string;
  why: string;
}

export interface KeywordReport {
  autocomplete_suggestions: { seed: string; suggestions: string[] }[];
  quick_wins: KeywordOpportunity[];
  blog_opportunities: BlogOpportunity[];
  pseo_templates: PseoTemplate[];
  competitor_gaps: CompetitorGap[];
}

export interface QuickFix {
  priority: 'high' | 'medium' | 'low';
  page: string;
  issue: string;
  fix: string;
  expected_impact: string;
}

export interface ContentImprovement {
  page: string;
  current_issue: string;
  suggested_title: string;
  suggested_meta_description: string;
  suggested_h1: string;
  content_additions: string[];
}

export interface BlogBriefSection {
  heading: string;
  bullets: string[];
  word_target?: number;
}

export type ContentType =
  | 'pillar'
  | 'cluster'
  | 'how_to'
  | 'listicle'
  | 'comparison'
  | 'definition'
  | 'case_study'
  | 'review';

export type SnippetType = 'paragraph' | 'list' | 'table' | 'none';

export interface BlogBrief {
  title: string;
  meta_title: string;
  meta_description: string;
  slug: string;
  target_keyword: string;
  secondary_keywords: string[];
  search_intent: string;
  content_type: ContentType;
  why_this_matters: string;
  featured_snippet_target: { type: SnippetType; query: string; answer_template: string };
  outline: BlogBriefSection[];
  faq: { question: string; short_answer: string }[];
  internal_links: { from_or_to: string; anchor: string }[];
  external_authority_links: { domain: string; reason: string }[];
  image_suggestions: { description: string; alt_text: string; placement: string }[];
  schema_markup: string[];
  estimated_word_count: number;
  priority: 'high' | 'medium' | 'low';
}

export interface PseoPlan {
  template_name: string;
  status: 'expand_existing' | 'new_template';
  url_pattern: string;
  target_keyword_template: string;
  meta_title_template: string;
  meta_description_template: string;
  h1_template: string;
  estimated_pages: number;
  data_source: string;
  example_pages: string[];
  required_sections: { section: string; min_words: number; purpose: string }[];
  schema_markup: string[];
  unique_content_per_page: string;
  thin_content_guards: string[];
  internal_linking_strategy: string;
  launch_checklist: string[];
  implementation_notes: string;
}

export interface InternalLink {
  from_page: string;
  to_page: string;
  anchor_text: string;
  reason: string;
}

export interface KeywordCluster {
  cluster_name: string;
  primary_page: string;
  total_impressions: number;
  queries: { keyword: string; position: number; impressions: number }[];
  recommendation: string;
}

export interface TechnicalIssue {
  issue: string;
  severity: 'critical' | 'warning' | 'info';
  fix: string;
}

export interface AuditReport {
  summary: string;
  health_score: number;
  health_score_rationale: string;
  top_3_actions: string[];
  quick_fixes: QuickFix[];
  content_improvements: ContentImprovement[];
  blog_briefs: BlogBrief[];
  pseo_plan: PseoPlan[];
  internal_links: InternalLink[];
  keyword_clusters: KeywordCluster[];
  technical_issues: TechnicalIssue[];
}

export type LLMProviderName = 'anthropic' | 'openai' | 'openai-compatible' | 'openrouter' | 'ollama';

export interface SeoPilotConfig {
  anthropic_api_key?: string;
  default_site?: string;
  google_client_id?: string;
  google_client_secret?: string;
  llm_provider?: LLMProviderName;
  llm_model?: string;
  llm_base_url?: string;
  llm_api_keys?: {
    anthropic?: string;
    openai?: string;
    'openai-compatible'?: string;
    openrouter?: string;
  };
}

export interface GoogleCredentials {
  access_token?: string;
  refresh_token: string;
  expiry_date?: number;
  scope?: string;
  token_type?: string;
}

export interface AuditOptions {
  site?: string;
  days: number;
  skipGsc: boolean;
  output: string;
  cwd: string;
  provider?: LLMProviderName;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}
