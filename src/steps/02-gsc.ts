import { resolveSite, searchAnalytics } from '../lib/gsc.js';
import type {
  GSCPageRow,
  GSCQueryRow,
  GSCReport,
  PageCluster,
  PageWithQueries,
  SiteStageDiagnosis,
} from '../types.js';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function urlPath(u: string): string {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
}

/** Detect URL patterns the site already uses for pSEO (e.g. /decline-codes/*, /alternatives/*). */
function detectClusters(pages: GSCPageRow[]): PageCluster[] {
  const groups = new Map<string, GSCPageRow[]>();
  for (const p of pages) {
    const path = urlPath(p.page);
    const segments = path.split('/').filter(Boolean);
    if (segments.length < 2) continue;
    const pattern = '/' + segments.slice(0, -1).join('/') + '/*';
    const arr = groups.get(pattern) ?? [];
    arr.push(p);
    groups.set(pattern, arr);
  }

  const clusters: PageCluster[] = [];
  for (const [pattern, members] of groups.entries()) {
    if (members.length < 3) continue;
    const totalImpressions = members.reduce((a, b) => a + b.impressions, 0);
    const totalClicks = members.reduce((a, b) => a + b.clicks, 0);
    const weightedPos = members.reduce((a, b) => a + b.position * b.impressions, 0);
    const avgPosition = totalImpressions > 0 ? weightedPos / totalImpressions : 0;
    const examplePages = members
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 3)
      .map(m => urlPath(m.page));
    clusters.push({
      pattern,
      pageCount: members.length,
      totalImpressions,
      totalClicks,
      avgPosition,
      examplePages,
    });
  }
  return clusters.sort((a, b) => b.totalImpressions - a.totalImpressions);
}

/** Build per-page reports with their top driving queries. */
function buildPagesWithQueries(pages: GSCPageRow[], queries: GSCQueryRow[]): PageWithQueries[] {
  const queriesByPage = new Map<string, GSCQueryRow[]>();
  for (const q of queries) {
    if (!q.page) continue;
    const arr = queriesByPage.get(q.page) ?? [];
    arr.push(q);
    queriesByPage.set(q.page, arr);
  }

  return pages
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 40)
    .map(p => {
      const top = (queriesByPage.get(p.page) ?? [])
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 5)
        .map(q => ({ query: q.query, impressions: q.impressions, clicks: q.clicks, position: q.position }));
      return {
        page: p.page,
        clicks: p.clicks,
        impressions: p.impressions,
        ctr: p.ctr,
        position: p.position,
        topQueries: top,
      };
    });
}

/** Diagnose the site stage from GSC signals. Drives the entire audit strategy. */
function diagnoseSite(args: {
  totalImpressions: number;
  totalClicks: number;
  avgCtr: number;
  avgPosition: number;
  pages: GSCPageRow[];
}): SiteStageDiagnosis {
  const { totalImpressions, totalClicks, avgCtr, avgPosition, pages } = args;

  const pagesWithImpressions = pages.filter(p => p.impressions > 0).length;
  const pagesInTop10 = pages.filter(p => p.position > 0 && p.position <= 10).length;
  const pagesInTop20 = pages.filter(p => p.position > 0 && p.position <= 20).length;
  const pagesWithImpressionsNoClicks = pages.filter(p => p.impressions >= 5 && p.clicks === 0).length;
  const pagesPositionGreater30 = pages.filter(p => p.impressions > 0 && p.position > 30).length;

  const signals = {
    pagesWithImpressions,
    pagesInTop10,
    pagesInTop20,
    pagesWithImpressionsNoClicks,
    pagesPositionGreater30,
  };

  if (totalImpressions < 100) {
    return {
      stage: 'no_data',
      stage_label: 'Not yet indexed or pre-launch',
      primary_goal: 'increase_impressions',
      primary_goal_label: 'Get indexed and start showing up',
      secondary_goals: [
        'Verify site is in Google index (site:domain.com check)',
        'Submit sitemap to GSC',
        'Publish foundational landing pages targeting brand and category terms',
        'Build basic on-page SEO foundation across all pages',
      ],
      rationale: `Only ${totalImpressions} impressions across the entire site. Indexability or content volume is the bottleneck, not optimization. Don't waste time on title tweaks until pages are actually being shown in search results.`,
      signals,
    };
  }

  if (totalImpressions < 1000 && pagesWithImpressions < 15) {
    return {
      stage: 'low_visibility',
      stage_label: 'Building visibility',
      primary_goal: 'increase_impressions',
      primary_goal_label: 'Expand keyword footprint and content surface area',
      secondary_goals: [
        'Publish more pages targeting long-tail informational terms',
        'Expand any working pSEO templates aggressively',
        'Build topical authority around 1-2 core themes',
        'Add internal links from any high-authority pages to new content',
      ],
      rationale: `${totalImpressions} impressions across only ${pagesWithImpressions} pages. The site is barely being shown. Goal is broader keyword coverage, not optimization of the few pages that exist.`,
      signals,
    };
  }

  const ctrTooLow = avgCtr < 0.012;
  const manyPagesNoClicks = pagesWithImpressionsNoClicks >= Math.max(5, pagesWithImpressions * 0.5);
  if (pagesWithImpressions >= 10 && (ctrTooLow || manyPagesNoClicks)) {
    return {
      stage: 'visibility_no_clicks',
      stage_label: 'Visibility without clicks',
      primary_goal: 'improve_ctr',
      primary_goal_label: 'Convert existing impressions into clicks',
      secondary_goals: [
        'Rewrite titles and meta descriptions for high-impression-low-CTR pages',
        'Add structured data (FAQPage, HowTo, Article) to win richer SERP appearances',
        'Push striking-distance keywords (positions 5-20) into the top 5',
        'Clarify search intent match on landing pages',
      ],
      rationale: `${totalImpressions} impressions converting to only ${totalClicks} clicks (${(avgCtr * 100).toFixed(2)}% CTR). ${pagesWithImpressionsNoClicks} pages are getting impressions but zero clicks. Pages are surfacing but not getting clicked. Don't add content; fix what's already showing up.`,
      signals,
    };
  }

  if (avgPosition > 30 || pagesPositionGreater30 >= pagesWithImpressions * 0.6) {
    return {
      stage: 'rank_improvement',
      stage_label: 'Indexed but ranking deep',
      primary_goal: 'rank_higher',
      primary_goal_label: 'Move pages from page 3+ into page 1',
      secondary_goals: [
        'Strengthen content depth on existing ranking pages (add 2-3x word count where shallow)',
        'Build internal links FROM high-authority pages TO target ranking pages',
        'Consolidate or redirect overlapping/cannibalising pages',
        'Expand the cluster around your top-performing pages',
      ],
      rationale: `Average position is ${avgPosition.toFixed(1)}. ${pagesPositionGreater30} of ${pagesWithImpressions} pages with impressions sit beyond position 30 (page 3+). Content depth, internal linking, and topical authority are the levers, not new pages.`,
      signals,
    };
  }

  if (totalClicks < 1000) {
    return {
      stage: 'has_traction',
      stage_label: 'Has traction, scaling phase',
      primary_goal: 'expand_winning_clusters',
      primary_goal_label: 'Double down on what is already working',
      secondary_goals: [
        'Expand pSEO templates already proving ROI',
        'Create supporting cluster content for top-performing pillar pages',
        'Build internal link graph between winners and supporting content',
        'Maintain CTR by refreshing meta tags on aging pages',
      ],
      rationale: `${totalClicks} clicks from ${totalImpressions} impressions (${(avgCtr * 100).toFixed(2)}% CTR). ${pagesInTop10} pages already in top 10. The site has product-market-fit signals; multiplying winners pays off more than starting fresh.`,
      signals,
    };
  }

  return {
    stage: 'scaling',
    stage_label: 'Scaling',
    primary_goal: 'topical_authority',
    primary_goal_label: 'Build deep topical authority and competitive moat',
    secondary_goals: [
      'Refresh aging top content (last update >6 months)',
      'Build pillar-cluster relationships across all topics',
      'Compete for higher-difficulty head terms',
      'Expand to adjacent topic clusters',
      'Build genuine backlink-worthy assets (data studies, tools)',
    ],
    rationale: `${totalClicks.toLocaleString()} clicks from ${totalImpressions.toLocaleString()} impressions. The site has presence; now it's about depth, defensibility, and competitive coverage in your niche.`,
    signals,
  };
}

/** Pick thresholds that scale with the site's total impressions. */
function adaptiveThresholds(totalImpressions: number) {
  if (totalImpressions >= 50_000) {
    return { strikingMinImpressions: 50, lowCtrMinImpressions: 200, lowCtrMaxCtr: 0.02 };
  }
  if (totalImpressions >= 5_000) {
    return { strikingMinImpressions: 20, lowCtrMinImpressions: 50, lowCtrMaxCtr: 0.025 };
  }
  if (totalImpressions >= 500) {
    return { strikingMinImpressions: 5, lowCtrMinImpressions: 15, lowCtrMaxCtr: 0.03 };
  }
  return { strikingMinImpressions: 2, lowCtrMinImpressions: 5, lowCtrMaxCtr: 0.04 };
}

export async function fetchGSCReport(siteInput: string, days: number): Promise<GSCReport> {
  const site = await resolveSite(siteInput);

  const endDate = isoDaysAgo(1);
  const startDate = isoDaysAgo(days);

  const [queryRows, pageRows] = await Promise.all([
    searchAnalytics(site, {
      startDate,
      endDate,
      dimensions: ['query', 'page'],
      rowLimit: 5000,
    }),
    searchAnalytics(site, {
      startDate,
      endDate,
      dimensions: ['page'],
      rowLimit: 1000,
    }),
  ]);

  const queries: GSCQueryRow[] = queryRows.map(r => ({
    query: r.keys?.[0] ?? '',
    page: r.keys?.[1],
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));

  const pages: GSCPageRow[] = pageRows.map(r => ({
    page: r.keys?.[0] ?? '',
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));

  const totalClicks = pages.reduce((a, b) => a + b.clicks, 0);
  const totalImpressions = pages.reduce((a, b) => a + b.impressions, 0);
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const weightedPositionSum = pages.reduce((a, b) => a + b.position * b.impressions, 0);
  const avgPosition = totalImpressions > 0 ? weightedPositionSum / totalImpressions : 0;

  const thresholds = adaptiveThresholds(totalImpressions);

  const strikingDistance = queries
    .filter(q => q.position >= 5 && q.position <= 30 && q.impressions >= thresholds.strikingMinImpressions)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 60);

  const highImpressionLowCtr = queries
    .filter(q => q.impressions >= thresholds.lowCtrMinImpressions && q.ctr < thresholds.lowCtrMaxCtr && q.position <= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 40);

  const topQueries = [...queries].sort((a, b) => b.impressions - a.impressions).slice(0, 50);
  const topPages = [...pages].sort((a, b) => b.impressions - a.impressions).slice(0, 40);

  const pagesWithQueries = buildPagesWithQueries(pages, queries);
  const existingClusters = detectClusters(pages);
  const diagnosis = diagnoseSite({ totalImpressions, totalClicks, avgCtr, avgPosition, pages });

  let decliningPages: GSCReport['decliningPages'] = [];
  if (days >= 60) {
    const recentStart = isoDaysAgo(30);
    const recentEnd = endDate;
    const priorStart = isoDaysAgo(60);
    const priorEnd = isoDaysAgo(31);

    const [recent, prior] = await Promise.all([
      searchAnalytics(site, { startDate: recentStart, endDate: recentEnd, dimensions: ['page'], rowLimit: 1000 }),
      searchAnalytics(site, { startDate: priorStart, endDate: priorEnd, dimensions: ['page'], rowLimit: 1000 }),
    ]);

    const recentMap = new Map<string, number>();
    for (const r of recent) recentMap.set(r.keys?.[0] ?? '', r.impressions ?? 0);
    const priorMap = new Map<string, number>();
    for (const r of prior) priorMap.set(r.keys?.[0] ?? '', r.impressions ?? 0);

    const declineMin = Math.max(20, Math.round(totalImpressions / 200));
    const allPages = new Set([...recentMap.keys(), ...priorMap.keys()]);
    const declines: GSCReport['decliningPages'] = [];
    for (const p of allPages) {
      if (!p) continue;
      const recentImp = recentMap.get(p) ?? 0;
      const priorImp = priorMap.get(p) ?? 0;
      if (priorImp < declineMin) continue;
      const deltaPct = ((recentImp - priorImp) / priorImp) * 100;
      if (deltaPct < -20) {
        declines.push({ page: p, previousImpressions: priorImp, recentImpressions: recentImp, deltaPct });
      }
    }
    decliningPages = declines.sort((a, b) => a.deltaPct - b.deltaPct).slice(0, 20);
  }

  return {
    site,
    startDate,
    endDate,
    totalClicks,
    totalImpressions,
    avgCtr,
    avgPosition,
    topQueries,
    topPages,
    pagesWithQueries,
    strikingDistance,
    highImpressionLowCtr,
    decliningPages,
    existingClusters,
    thresholds,
    diagnosis,
  };
}
