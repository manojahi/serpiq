import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, slugify, todayISO } from '../lib/fs.js';
import type { AuditReport, GSCReport, KeywordReport, ProductContext } from '../types.js';

export interface OutputBundle {
  product: ProductContext;
  gsc: GSCReport | null;
  keywords: KeywordReport;
  audit: AuditReport;
}

export interface OutputPaths {
  root: string;
  auditMd: string;
  auditJson: string;
  briefsDir: string;
  pseoDir: string;
}

export function writeOutputs(outputDir: string, bundle: OutputBundle): OutputPaths {
  ensureDir(outputDir);
  const briefsDir = path.join(outputDir, 'blog-briefs');
  const pseoDir = path.join(outputDir, 'pseo');
  ensureDir(briefsDir);
  ensureDir(pseoDir);

  const date = todayISO();
  const auditMdPath = path.join(outputDir, `audit-${date}.md`);
  const auditJsonPath = path.join(outputDir, `audit-${date}.json`);

  fs.writeFileSync(auditJsonPath, JSON.stringify(bundle, null, 2));
  fs.writeFileSync(auditMdPath, renderAuditMarkdown(bundle, date));

  const usedSlugs = new Set<string>();
  for (const brief of bundle.audit.blog_briefs) {
    let slug = slugify(brief.target_keyword || brief.title) || 'untitled';
    let i = 2;
    while (usedSlugs.has(slug)) slug = `${slug}-${i++}`;
    usedSlugs.add(slug);
    const file = path.join(briefsDir, `brief-${slug}.md`);
    fs.writeFileSync(file, renderBriefMarkdown(brief));
  }

  fs.writeFileSync(path.join(pseoDir, 'pseo-plan.md'), renderPseoPlanMarkdown(bundle.audit, bundle.product));

  return { root: outputDir, auditMd: auditMdPath, auditJson: auditJsonPath, briefsDir, pseoDir };
}

function renderAuditMarkdown(b: OutputBundle, date: string): string {
  const { product, gsc, audit } = b;
  const lines: string[] = [];
  lines.push(`# SEO Audit: ${product.product_name}`);
  lines.push(`Generated: ${date} by serpIQ`);
  lines.push('');
  lines.push(`## Health Score: ${audit.health_score}/100`);
  lines.push('');
  lines.push(`**Product:** ${product.product_description}`);
  lines.push(`**Category:** ${product.product_category}`);
  if (gsc) {
    lines.push(`**GSC Property:** \`${gsc.site}\` (${gsc.startDate} to ${gsc.endDate})`);
    lines.push(`**Performance:** ${gsc.totalClicks.toLocaleString()} clicks · ${gsc.totalImpressions.toLocaleString()} impressions · CTR ${(gsc.avgCtr * 100).toFixed(2)}% · avg pos ${gsc.avgPosition.toFixed(1)}`);
  } else {
    lines.push(`**GSC:** Skipped or unavailable`);
  }
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(audit.summary);
  lines.push('');

  if (audit.quick_fixes.length > 0) {
    lines.push('## Quick Fixes (do these first)');
    lines.push('');
    lines.push('| Priority | Page | Issue | Fix |');
    lines.push('|----------|------|-------|-----|');
    for (const f of audit.quick_fixes) {
      lines.push(`| ${f.priority} | ${escapeCell(f.page)} | ${escapeCell(f.issue)} | ${escapeCell(f.fix)} |`);
    }
    lines.push('');
  }

  if (gsc && gsc.strikingDistance.length > 0) {
    lines.push('## Striking Distance Keywords (positions 8–20)');
    lines.push('');
    lines.push('| Keyword | Position | Impressions | Page |');
    lines.push('|---------|----------|-------------|------|');
    for (const q of gsc.strikingDistance.slice(0, 25)) {
      lines.push(`| ${escapeCell(q.query)} | ${q.position.toFixed(1)} | ${q.impressions} | ${escapeCell(q.page ?? '')} |`);
    }
    lines.push('');
  }

  if (gsc && gsc.highImpressionLowCtr.length > 0) {
    lines.push('## High Impression, Low CTR (title/meta fix opportunities)');
    lines.push('');
    lines.push('| Keyword | Impressions | CTR | Position |');
    lines.push('|---------|-------------|-----|----------|');
    for (const q of gsc.highImpressionLowCtr.slice(0, 15)) {
      lines.push(`| ${escapeCell(q.query)} | ${q.impressions} | ${(q.ctr * 100).toFixed(2)}% | ${q.position.toFixed(1)} |`);
    }
    lines.push('');
  }

  if (audit.content_improvements.length > 0) {
    lines.push('## Content Improvements');
    lines.push('');
    for (const c of audit.content_improvements) {
      lines.push(`### ${c.page}`);
      lines.push(`- **Current Issue:** ${c.current_issue}`);
      lines.push(`- **Suggested Title:** ${c.suggested_title}`);
      lines.push(`- **Suggested Meta:** ${c.suggested_meta_description}`);
      lines.push(`- **Suggested H1:** ${c.suggested_h1}`);
      if (c.content_additions.length > 0) {
        lines.push(`- **Content Additions:**`);
        for (const a of c.content_additions) lines.push(`  - ${a}`);
      }
      lines.push('');
    }
  }

  lines.push('## Blog Content Plan');
  lines.push('');
  lines.push(`${audit.blog_briefs.length} blog posts identified. See \`./blog-briefs/\` for full briefs.`);
  if (audit.blog_briefs.length > 0) {
    lines.push('');
    lines.push('| Priority | Title | Target Keyword | Words |');
    lines.push('|----------|-------|----------------|-------|');
    for (const b of audit.blog_briefs) {
      lines.push(`| ${b.priority} | ${escapeCell(b.title)} | ${escapeCell(b.target_keyword)} | ${b.estimated_word_count} |`);
    }
  }
  lines.push('');

  lines.push('## pSEO Opportunities');
  lines.push('');
  const totalPages = audit.pseo_plan.reduce((a, b) => a + (b.estimated_pages || 0), 0);
  lines.push(`${audit.pseo_plan.length} programmatic SEO templates identified (~${totalPages} pages estimated). See \`./pseo/pseo-plan.md\``);
  lines.push('');

  if (audit.technical_issues.length > 0) {
    lines.push('## Technical Issues');
    lines.push('');
    lines.push('| Severity | Issue | Fix |');
    lines.push('|----------|-------|-----|');
    for (const t of audit.technical_issues) {
      lines.push(`| ${t.severity} | ${escapeCell(t.issue)} | ${escapeCell(t.fix)} |`);
    }
    lines.push('');
  }

  if (gsc && gsc.decliningPages.length > 0) {
    lines.push('## Pages with Declining Impressions (last 30 vs prior 30 days)');
    lines.push('');
    lines.push('| Page | Prior | Recent | Change |');
    lines.push('|------|-------|--------|--------|');
    for (const p of gsc.decliningPages) {
      lines.push(`| ${escapeCell(p.page)} | ${p.previousImpressions} | ${p.recentImpressions} | ${p.deltaPct.toFixed(1)}% |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('Generated by [serpIQ](https://www.npmjs.com/package/serpiq).');
  return lines.join('\n');
}

function renderBriefMarkdown(brief: AuditReport['blog_briefs'][number]): string {
  const lines: string[] = [];
  lines.push(`# ${brief.title}`);
  lines.push(`**Target Keyword:** ${brief.target_keyword}  `);
  lines.push(`**Search Intent:** ${brief.search_intent}  `);
  lines.push(`**Estimated Length:** ${brief.estimated_word_count} words  `);
  lines.push(`**Priority:** ${brief.priority}`);
  lines.push('');
  lines.push('## Outline');
  brief.outline.forEach((o, i) => lines.push(`${i + 1}. ${o}`));
  lines.push('');
  return lines.join('\n');
}

function renderPseoPlanMarkdown(audit: AuditReport, product: ProductContext): string {
  const lines: string[] = [];
  lines.push(`# pSEO Implementation Plan: ${product.product_name}`);
  lines.push('');
  if (audit.pseo_plan.length === 0) {
    lines.push('No pSEO templates identified for this product.');
    return lines.join('\n');
  }

  for (const p of audit.pseo_plan) {
    lines.push(`## ${p.template_name}`);
    lines.push('');
    lines.push(`- **URL Pattern:** \`${p.url_pattern}\``);
    lines.push(`- **Target Keyword Template:** ${p.target_keyword_template}`);
    lines.push(`- **Estimated Pages:** ${p.estimated_pages}`);
    lines.push(`- **Data Source:** ${p.data_source}`);
    lines.push('');
    if (p.example_pages.length > 0) {
      lines.push('**Example Pages:**');
      for (const ex of p.example_pages) lines.push(`- ${ex}`);
      lines.push('');
    }
    lines.push('**Implementation Notes:**');
    lines.push('');
    lines.push(p.implementation_notes);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

function escapeCell(s: string): string {
  return (s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}
