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
  strikingDistance: GSCQueryRow[];
  highImpressionLowCtr: GSCQueryRow[];
  decliningPages: { page: string; previousImpressions: number; recentImpressions: number; deltaPct: number }[];
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

export interface BlogBrief {
  title: string;
  target_keyword: string;
  search_intent: string;
  outline: string[];
  estimated_word_count: number;
  priority: 'high' | 'medium' | 'low';
}

export interface PseoPlan {
  template_name: string;
  url_pattern: string;
  target_keyword_template: string;
  estimated_pages: number;
  data_source: string;
  example_pages: string[];
  implementation_notes: string;
}

export interface TechnicalIssue {
  issue: string;
  severity: 'critical' | 'warning' | 'info';
  fix: string;
}

export interface AuditReport {
  summary: string;
  health_score: number;
  quick_fixes: QuickFix[];
  content_improvements: ContentImprovement[];
  blog_briefs: BlogBrief[];
  pseo_plan: PseoPlan[];
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
