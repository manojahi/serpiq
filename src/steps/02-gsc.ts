import { resolveSite, searchAnalytics } from '../lib/gsc.js';
import type { GSCPageRow, GSCQueryRow, GSCReport } from '../types.js';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
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
      rowLimit: 1000,
    }),
    searchAnalytics(site, {
      startDate,
      endDate,
      dimensions: ['page'],
      rowLimit: 500,
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

  const strikingDistance = queries
    .filter(q => q.position >= 8 && q.position <= 20 && q.impressions > 50)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 50);

  const highImpressionLowCtr = queries
    .filter(q => q.impressions > 200 && q.ctr < 0.02)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 30);

  const topQueries = [...queries].sort((a, b) => b.clicks - a.clicks).slice(0, 30);
  const topPages = [...pages].sort((a, b) => b.clicks - a.clicks).slice(0, 30);

  let decliningPages: GSCReport['decliningPages'] = [];
  if (days >= 60) {
    const recentStart = isoDaysAgo(30);
    const recentEnd = endDate;
    const priorStart = isoDaysAgo(60);
    const priorEnd = isoDaysAgo(31);

    const [recent, prior] = await Promise.all([
      searchAnalytics(site, { startDate: recentStart, endDate: recentEnd, dimensions: ['page'], rowLimit: 500 }),
      searchAnalytics(site, { startDate: priorStart, endDate: priorEnd, dimensions: ['page'], rowLimit: 500 }),
    ]);

    const recentMap = new Map<string, number>();
    for (const r of recent) recentMap.set(r.keys?.[0] ?? '', r.impressions ?? 0);
    const priorMap = new Map<string, number>();
    for (const r of prior) priorMap.set(r.keys?.[0] ?? '', r.impressions ?? 0);

    const allPages = new Set([...recentMap.keys(), ...priorMap.keys()]);
    const declines: GSCReport['decliningPages'] = [];
    for (const p of allPages) {
      if (!p) continue;
      const recentImp = recentMap.get(p) ?? 0;
      const priorImp = priorMap.get(p) ?? 0;
      if (priorImp < 100) continue;
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
    strikingDistance,
    highImpressionLowCtr,
    decliningPages,
  };
}
