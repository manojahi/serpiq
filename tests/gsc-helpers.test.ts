import { describe, it, expect } from 'vitest';
import {
  urlPath,
  detectClusters,
  buildPagesWithQueries,
  diagnoseSite,
  adaptiveThresholds,
} from '../src/steps/02-gsc.js';
import type { GSCPageRow, GSCQueryRow } from '../src/types.js';

const page = (overrides: Partial<GSCPageRow> = {}): GSCPageRow => ({
  page: 'https://example.com/foo',
  clicks: 0,
  impressions: 0,
  ctr: 0,
  position: 0,
  ...overrides,
});

describe('urlPath', () => {
  it('extracts pathname from absolute URL', () => {
    expect(urlPath('https://example.com/blog/post-1')).toBe('/blog/post-1');
  });

  it('returns the input for invalid URLs', () => {
    expect(urlPath('not a url')).toBe('not a url');
  });

  it('handles trailing slash', () => {
    expect(urlPath('https://example.com/foo/')).toBe('/foo/');
  });
});

describe('detectClusters', () => {
  it('identifies cluster URL patterns from grouped pages', () => {
    const pages = [
      page({ page: 'https://x.com/decline-codes/code-101', impressions: 100, clicks: 5, position: 12 }),
      page({ page: 'https://x.com/decline-codes/code-102', impressions: 200, clicks: 10, position: 8 }),
      page({ page: 'https://x.com/decline-codes/code-103', impressions: 50, clicks: 1, position: 18 }),
      page({ page: 'https://x.com/decline-codes/code-104', impressions: 80, clicks: 4, position: 14 }),
      page({ page: 'https://x.com/decline-codes/code-105', impressions: 30, clicks: 0, position: 22 }),
      page({ page: 'https://x.com/about', impressions: 10 }),
    ];
    const clusters = detectClusters(pages);
    const c = clusters.find(c => c.pattern === '/decline-codes/*');
    expect(c).toBeDefined();
    expect(c!.pageCount).toBe(5);
    expect(c!.totalImpressions).toBe(460);
    expect(c!.totalClicks).toBe(20);
    expect(c!.examplePages.length).toBeGreaterThan(0);
  });

  it('ignores patterns with fewer than 3 pages', () => {
    const pages = [
      page({ page: 'https://x.com/a/1', impressions: 10 }),
      page({ page: 'https://x.com/a/2', impressions: 10 }),
      page({ page: 'https://x.com/about', impressions: 10 }),
    ];
    expect(detectClusters(pages)).toEqual([]);
  });

  it('returns clusters sorted by total impressions desc', () => {
    const mk = (pattern: string, n: number, imp: number) =>
      Array.from({ length: n }, (_, i) =>
        page({ page: `https://x.com${pattern}/p${i}`, impressions: imp })
      );
    const pages = [
      ...mk('/small', 3, 10),
      ...mk('/big', 4, 500),
      ...mk('/mid', 5, 50),
    ];
    const clusters = detectClusters(pages);
    expect(clusters[0].pattern).toBe('/big/*');
    expect(clusters[1].pattern).toBe('/mid/*');
  });
});

describe('buildPagesWithQueries', () => {
  it('attaches top 5 queries by impressions to each page', () => {
    const pages = [page({ page: 'https://x.com/foo', impressions: 100 })];
    const queries: GSCQueryRow[] = Array.from({ length: 8 }, (_, i) => ({
      query: `q${i}`,
      page: 'https://x.com/foo',
      clicks: 0,
      impressions: 100 - i,
      ctr: 0,
      position: 10,
    }));
    const result = buildPagesWithQueries(pages, queries);
    expect(result).toHaveLength(1);
    expect(result[0].topQueries).toHaveLength(5);
    expect(result[0].topQueries[0].query).toBe('q0');
    expect(result[0].topQueries[4].query).toBe('q4');
  });

  it('returns empty topQueries when no queries match the page', () => {
    const pages = [page({ page: 'https://x.com/foo' })];
    const queries: GSCQueryRow[] = [
      { query: 'q1', page: 'https://x.com/bar', clicks: 0, impressions: 10, ctr: 0, position: 1 },
    ];
    const result = buildPagesWithQueries(pages, queries);
    expect(result[0].topQueries).toEqual([]);
  });
});

describe('adaptiveThresholds', () => {
  it('uses tightest thresholds for tiny sites', () => {
    expect(adaptiveThresholds(50)).toEqual({
      strikingMinImpressions: 2,
      lowCtrMinImpressions: 5,
      lowCtrMaxCtr: 0.04,
    });
  });

  it('scales up for small sites (500-5k)', () => {
    expect(adaptiveThresholds(1000).strikingMinImpressions).toBe(5);
  });

  it('scales up for medium sites (5k-50k)', () => {
    expect(adaptiveThresholds(10_000).strikingMinImpressions).toBe(20);
  });

  it('uses widest thresholds for large sites', () => {
    expect(adaptiveThresholds(100_000)).toEqual({
      strikingMinImpressions: 50,
      lowCtrMinImpressions: 200,
      lowCtrMaxCtr: 0.02,
    });
  });

  it('applies large thresholds at exactly 50k boundary', () => {
    expect(adaptiveThresholds(50_000).strikingMinImpressions).toBe(50);
  });
});

describe('diagnoseSite', () => {
  it('returns no_data stage when impressions < 100', () => {
    const r = diagnoseSite({
      totalImpressions: 30,
      totalClicks: 0,
      avgCtr: 0,
      avgPosition: 0,
      pages: [],
    });
    expect(r.stage).toBe('no_data');
    expect(r.primary_goal).toBe('increase_impressions');
  });

  it('returns low_visibility for sites with limited footprint', () => {
    const r = diagnoseSite({
      totalImpressions: 500,
      totalClicks: 5,
      avgCtr: 0.01,
      avgPosition: 25,
      pages: [page({ impressions: 50 }), page({ impressions: 30 })],
    });
    expect(r.stage).toBe('low_visibility');
    expect(r.primary_goal).toBe('increase_impressions');
  });

  it('returns visibility_no_clicks when CTR is very low', () => {
    const pages = Array.from({ length: 12 }, () =>
      page({ impressions: 200, clicks: 0, position: 8 })
    );
    const r = diagnoseSite({
      totalImpressions: 5000,
      totalClicks: 30,
      avgCtr: 0.006,
      avgPosition: 8,
      pages,
    });
    expect(r.stage).toBe('visibility_no_clicks');
    expect(r.primary_goal).toBe('improve_ctr');
  });

  it('returns rank_improvement when most pages rank deep', () => {
    const pages = Array.from({ length: 20 }, () =>
      page({ impressions: 100, clicks: 2, position: 45 })
    );
    const r = diagnoseSite({
      totalImpressions: 4000,
      totalClicks: 60,
      avgCtr: 0.015,
      avgPosition: 45,
      pages,
    });
    expect(r.stage).toBe('rank_improvement');
    expect(r.primary_goal).toBe('rank_higher');
  });

  it('returns has_traction for sites with healthy clicks', () => {
    const pages = Array.from({ length: 25 }, () =>
      page({ impressions: 400, clicks: 20, position: 6 })
    );
    const r = diagnoseSite({
      totalImpressions: 25_000,
      totalClicks: 500,
      avgCtr: 0.02,
      avgPosition: 6,
      pages,
    });
    expect(r.stage).toBe('has_traction');
  });

  it('returns scaling for high-traffic sites', () => {
    const pages = Array.from({ length: 50 }, () =>
      page({ impressions: 1000, clicks: 50, position: 5 })
    );
    const r = diagnoseSite({
      totalImpressions: 200_000,
      totalClicks: 5000,
      avgCtr: 0.025,
      avgPosition: 5,
      pages,
    });
    expect(r.stage).toBe('scaling');
    expect(r.primary_goal).toBe('topical_authority');
  });

  it('exposes signal counts for inspection', () => {
    const pages = [
      page({ impressions: 100, position: 5 }),
      page({ impressions: 100, position: 15 }),
      page({ impressions: 0, position: 0 }),
    ];
    const r = diagnoseSite({
      totalImpressions: 200,
      totalClicks: 5,
      avgCtr: 0.025,
      avgPosition: 10,
      pages,
    });
    expect(r.signals.pagesWithImpressions).toBe(2);
    expect(r.signals.pagesInTop10).toBe(1);
    expect(r.signals.pagesInTop20).toBe(2);
  });
});
