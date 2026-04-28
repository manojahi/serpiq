import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, slugify, todayISO } from '../lib/fs.js';
import { blogBriefAppendix, pseoAppendix } from '../lib/seo-guidelines.js';
import type { AuditReport, BlogBrief, GSCReport, KeywordReport, ProductContext } from '../types.js';

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
    let slug = brief.slug || slugify(brief.target_keyword || brief.title) || 'untitled';
    let i = 2;
    while (usedSlugs.has(slug)) slug = `${slug}-${i++}`;
    usedSlugs.add(slug);
    const file = path.join(briefsDir, `brief-${slug}.md`);
    fs.writeFileSync(file, renderBriefMarkdown(brief, bundle.product));
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
  if (audit.health_score_rationale) {
    lines.push(`> ${audit.health_score_rationale}`);
    lines.push('');
  }
  lines.push(`**Product:** ${product.product_description}`);
  lines.push(`**Category:** ${product.product_category}`);
  if (gsc) {
    lines.push(`**GSC Property:** \`${gsc.site}\` (${gsc.startDate} to ${gsc.endDate})`);
    lines.push(
      `**Performance:** ${gsc.totalClicks.toLocaleString()} clicks · ${gsc.totalImpressions.toLocaleString()} impressions · CTR ${(gsc.avgCtr * 100).toFixed(2)}% · avg pos ${gsc.avgPosition.toFixed(1)}`
    );
  } else {
    lines.push(`**GSC:** Skipped or unavailable`);
  }
  lines.push('');

  if (gsc?.diagnosis) {
    const d = gsc.diagnosis;
    lines.push(`## Stage: ${d.stage_label}`);
    lines.push('');
    lines.push(`**Primary goal:** ${d.primary_goal_label}`);
    lines.push('');
    lines.push(`> ${d.rationale}`);
    lines.push('');
    if (d.secondary_goals.length > 0) {
      lines.push('**Supporting goals:**');
      for (const g of d.secondary_goals) lines.push(`- ${g}`);
      lines.push('');
    }
    lines.push('**Site signals:**');
    lines.push(`- Pages with impressions: ${d.signals.pagesWithImpressions}`);
    lines.push(`- Pages in top 10: ${d.signals.pagesInTop10}`);
    lines.push(`- Pages in top 20: ${d.signals.pagesInTop20}`);
    lines.push(`- Pages with impressions but zero clicks: ${d.signals.pagesWithImpressionsNoClicks}`);
    lines.push(`- Pages ranking past position 30: ${d.signals.pagesPositionGreater30}`);
    lines.push('');
  }

  if (audit.top_3_actions.length > 0) {
    lines.push('## Do These Three Things This Week');
    lines.push('');
    audit.top_3_actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
    lines.push('');
  }

  lines.push('## Executive Summary');
  lines.push('');
  lines.push(audit.summary);
  lines.push('');

  if (audit.quick_fixes.length > 0) {
    lines.push(`## Quick Fixes (${audit.quick_fixes.length})`);
    lines.push('');
    lines.push('| # | Priority | Page | Issue | Fix | Expected Impact |');
    lines.push('|---|----------|------|-------|-----|-----------------|');
    audit.quick_fixes.forEach((f, i) => {
      lines.push(
        `| ${i + 1} | ${f.priority} | ${escapeCell(f.page)} | ${escapeCell(f.issue)} | ${escapeCell(f.fix)} | ${escapeCell(f.expected_impact)} |`
      );
    });
    lines.push('');
  }

  if (gsc && gsc.existingClusters.length > 0) {
    lines.push('## Existing pSEO Clusters Detected');
    lines.push('');
    lines.push(
      'These URL patterns already exist on your site. Expanding what works is faster than starting new templates.'
    );
    lines.push('');
    lines.push('| Pattern | Pages | Impressions | Clicks | Avg Pos |');
    lines.push('|---------|-------|-------------|--------|---------|');
    for (const c of gsc.existingClusters.slice(0, 10)) {
      lines.push(
        `| \`${c.pattern}\` | ${c.pageCount} | ${c.totalImpressions} | ${c.totalClicks} | ${c.avgPosition.toFixed(1)} |`
      );
    }
    lines.push('');
  }

  if (audit.keyword_clusters.length > 0) {
    lines.push('## Keyword Clusters');
    lines.push('');
    for (const cl of audit.keyword_clusters) {
      lines.push(`### ${cl.cluster_name}`);
      lines.push(`**Primary page:** \`${cl.primary_page}\` · **Total impressions:** ${cl.total_impressions}`);
      lines.push('');
      if (cl.queries.length > 0) {
        lines.push('| Keyword | Position | Impressions |');
        lines.push('|---------|----------|-------------|');
        for (const q of cl.queries) {
          lines.push(`| ${escapeCell(q.keyword)} | ${q.position} | ${q.impressions} |`);
        }
        lines.push('');
      }
      lines.push(`**Recommendation:** ${cl.recommendation}`);
      lines.push('');
    }
  }

  if (gsc && gsc.strikingDistance.length > 0) {
    lines.push(
      `## Striking Distance Keywords (${gsc.strikingDistance.length}, position 5-30, ≥${gsc.thresholds.strikingMinImpressions} impr)`
    );
    lines.push('');
    lines.push('| Keyword | Position | Impressions | Page |');
    lines.push('|---------|----------|-------------|------|');
    for (const q of gsc.strikingDistance.slice(0, 30)) {
      lines.push(
        `| ${escapeCell(q.query)} | ${q.position.toFixed(1)} | ${q.impressions} | ${escapeCell(q.page ?? '')} |`
      );
    }
    lines.push('');
  }

  if (gsc && gsc.highImpressionLowCtr.length > 0) {
    lines.push(
      `## High Impression, Low CTR (${gsc.highImpressionLowCtr.length}, CTR <${(gsc.thresholds.lowCtrMaxCtr * 100).toFixed(1)}%)`
    );
    lines.push('');
    lines.push('| Keyword | Impressions | CTR | Position | Page |');
    lines.push('|---------|-------------|-----|----------|------|');
    for (const q of gsc.highImpressionLowCtr.slice(0, 20)) {
      lines.push(
        `| ${escapeCell(q.query)} | ${q.impressions} | ${(q.ctr * 100).toFixed(2)}% | ${q.position.toFixed(1)} | ${escapeCell(q.page ?? '')} |`
      );
    }
    lines.push('');
  }

  if (audit.content_improvements.length > 0) {
    lines.push(`## Content Improvements (${audit.content_improvements.length})`);
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

  if (audit.internal_links.length > 0) {
    lines.push(`## Internal Linking Opportunities (${audit.internal_links.length})`);
    lines.push('');
    lines.push('| From | To | Anchor Text | Reason |');
    lines.push('|------|----|----|--------|');
    for (const l of audit.internal_links) {
      lines.push(
        `| ${escapeCell(l.from_page)} | ${escapeCell(l.to_page)} | ${escapeCell(l.anchor_text)} | ${escapeCell(l.reason)} |`
      );
    }
    lines.push('');
  }

  lines.push(`## Blog Content Plan (${audit.blog_briefs.length})`);
  lines.push('');
  lines.push(`${audit.blog_briefs.length} blog posts identified. Full briefs in \`./blog-briefs/\`.`);
  if (audit.blog_briefs.length > 0) {
    lines.push('');
    lines.push('| Priority | Title | Target Keyword | Type | Words |');
    lines.push('|----------|-------|----------------|------|-------|');
    for (const b of audit.blog_briefs) {
      lines.push(
        `| ${b.priority} | ${escapeCell(b.title)} | ${escapeCell(b.target_keyword)} | ${b.content_type} | ${b.estimated_word_count} |`
      );
    }
  }
  lines.push('');

  lines.push(`## pSEO Opportunities (${audit.pseo_plan.length})`);
  lines.push('');
  const totalPages = audit.pseo_plan.reduce((a, b) => a + (b.estimated_pages || 0), 0);
  const expandCount = audit.pseo_plan.filter(p => p.status === 'expand_existing').length;
  const newCount = audit.pseo_plan.filter(p => p.status !== 'expand_existing').length;
  lines.push(
    `${expandCount} expansion${expandCount === 1 ? '' : 's'} of existing templates · ${newCount} new template${newCount === 1 ? '' : 's'} · ~${totalPages} pages estimated.`
  );
  lines.push('');
  lines.push('See `./pseo/pseo-plan.md` for full implementation specs.');
  lines.push('');

  if (audit.technical_issues.length > 0) {
    lines.push(`## Technical Issues (${audit.technical_issues.length})`);
    lines.push('');
    lines.push('| Severity | Issue | Fix |');
    lines.push('|----------|-------|-----|');
    for (const t of audit.technical_issues) {
      lines.push(`| ${t.severity} | ${escapeCell(t.issue)} | ${escapeCell(t.fix)} |`);
    }
    lines.push('');
  }

  if (gsc && gsc.decliningPages.length > 0) {
    lines.push(`## Pages with Declining Impressions (${gsc.decliningPages.length})`);
    lines.push('');
    lines.push('Last 30 days vs prior 30 days.');
    lines.push('');
    lines.push('| Page | Prior | Recent | Change |');
    lines.push('|------|-------|--------|--------|');
    for (const p of gsc.decliningPages) {
      lines.push(
        `| ${escapeCell(p.page)} | ${p.previousImpressions} | ${p.recentImpressions} | ${p.deltaPct.toFixed(1)}% |`
      );
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('Generated by [serpIQ](https://www.npmjs.com/package/serpiq).');
  return lines.join('\n');
}

function renderBriefMarkdown(brief: BlogBrief, product: ProductContext): string {
  const lines: string[] = [];
  lines.push(`# ${brief.title}`);
  lines.push('');

  lines.push('## Brief Summary');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| Target keyword | \`${brief.target_keyword}\` |`);
  lines.push(`| Search intent | ${brief.search_intent} |`);
  lines.push(`| Content type | ${brief.content_type} |`);
  lines.push(`| Priority | ${brief.priority} |`);
  lines.push(`| Estimated word count | ${brief.estimated_word_count} |`);
  lines.push(`| URL slug | \`${brief.slug}\` |`);
  lines.push(`| Schema markup | ${brief.schema_markup.join(', ')} |`);
  lines.push('');

  lines.push('## Meta Tags (copy into `<head>`)');
  lines.push('');
  lines.push('```html');
  lines.push(`<title>${brief.meta_title}</title>`);
  lines.push(`<meta name="description" content="${brief.meta_description}">`);
  lines.push(`<link rel="canonical" href="https://yourdomain.com/blog/${brief.slug}">`);
  lines.push('<meta property="og:type" content="article">');
  lines.push(`<meta property="og:title" content="${brief.meta_title}">`);
  lines.push(`<meta property="og:description" content="${brief.meta_description}">`);
  lines.push('<meta name="twitter:card" content="summary_large_image">');
  lines.push('```');
  lines.push('');

  if (brief.secondary_keywords.length > 0) {
    lines.push('## Keywords to Target');
    lines.push('');
    lines.push(`**Primary:** \`${brief.target_keyword}\``);
    lines.push('');
    lines.push('**Secondary / semantic variants:**');
    for (const k of brief.secondary_keywords) lines.push(`- \`${k}\``);
    lines.push('');
  }

  if (brief.why_this_matters) {
    lines.push('## Why This Brief');
    lines.push('');
    lines.push(brief.why_this_matters);
    lines.push('');
  }

  lines.push('## Article Outline');
  lines.push('');
  brief.outline.forEach((section, i) => {
    const wordTag = section.word_target ? ` _(target: ~${section.word_target} words)_` : '';
    lines.push(`### ${i + 1}. ${section.heading}${wordTag}`);
    if (section.bullets && section.bullets.length > 0) {
      for (const b of section.bullets) lines.push(`- ${b}`);
    }
    lines.push('');
  });

  if (brief.faq.length > 0) {
    lines.push('## FAQ Section');
    lines.push('');
    lines.push('Include this section near the bottom of the article. Wrap with `FAQPage` schema (see appendix).');
    lines.push('');
    for (const q of brief.faq) {
      lines.push(`**Q: ${q.question}**`);
      lines.push('');
      lines.push(q.short_answer);
      lines.push('');
    }
  }

  if (brief.internal_links.length > 0) {
    lines.push('## Internal Links to Include');
    lines.push('');
    lines.push('| URL | Anchor text |');
    lines.push('|-----|-------------|');
    for (const l of brief.internal_links) {
      lines.push(`| \`${escapeCell(l.from_or_to)}\` | ${escapeCell(l.anchor)} |`);
    }
    lines.push('');
  }

  if (brief.external_authority_links.length > 0) {
    lines.push('## External Authority Links');
    lines.push('');
    lines.push('Cite these to build E-E-A-T. Link with descriptive anchor text.');
    lines.push('');
    for (const l of brief.external_authority_links) {
      lines.push(`- **${l.domain}** - ${l.reason}`);
    }
    lines.push('');
  }

  if (brief.image_suggestions.length > 0) {
    lines.push('## Image Suggestions');
    lines.push('');
    lines.push('| Placement | Description | Alt text |');
    lines.push('|-----------|-------------|----------|');
    for (const img of brief.image_suggestions) {
      lines.push(`| ${escapeCell(img.placement)} | ${escapeCell(img.description)} | ${escapeCell(img.alt_text)} |`);
    }
    lines.push('');
  }

  lines.push(blogBriefAppendix(brief, product.product_name));

  lines.push('---');
  lines.push(`Generated by [serpIQ](https://www.npmjs.com/package/serpiq).`);
  return lines.join('\n');
}

function renderPseoPlanMarkdown(audit: AuditReport, product: ProductContext): string {
  const lines: string[] = [];
  lines.push(`# pSEO Implementation Plan: ${product.product_name}`);
  lines.push('');
  if (audit.pseo_plan.length === 0) {
    lines.push('No pSEO templates identified for this product at this stage.');
    return lines.join('\n');
  }

  const expand = audit.pseo_plan.filter(p => p.status === 'expand_existing');
  const fresh = audit.pseo_plan.filter(p => p.status !== 'expand_existing');

  if (expand.length > 0) {
    lines.push('## Expand existing templates first');
    lines.push('');
    lines.push(
      'These URL patterns already exist on your site and are getting impressions. Add more pages to them before building anything new - the indexing and ranking signals are already there.'
    );
    lines.push('');
    for (const p of expand) lines.push(...renderPseoSection(p));
  }

  if (fresh.length > 0) {
    lines.push('## New pSEO templates');
    lines.push('');
    for (const p of fresh) lines.push(...renderPseoSection(p));
  }

  lines.push(pseoAppendix(audit.pseo_plan, product.product_name));

  lines.push('---');
  lines.push(`Generated by [serpIQ](https://www.npmjs.com/package/serpiq).`);

  return lines.join('\n');
}

function renderPseoSection(p: AuditReport['pseo_plan'][number]): string[] {
  const lines: string[] = [];
  lines.push(`### ${p.template_name}`);
  lines.push('');
  lines.push(`**Status:** ${p.status === 'expand_existing' ? 'expand existing template' : 'new template'}  `);
  lines.push(`**URL pattern:** \`${p.url_pattern}\`  `);
  lines.push(`**Estimated pages:** ${p.estimated_pages}`);
  lines.push('');

  if (p.meta_title_template || p.meta_description_template || p.h1_template) {
    lines.push('#### Meta + heading templates');
    lines.push('');
    if (p.h1_template) lines.push(`- **H1 template:** \`${p.h1_template}\``);
    if (p.meta_title_template) lines.push(`- **Meta title template:** \`${p.meta_title_template}\``);
    if (p.meta_description_template) lines.push(`- **Meta description template:** \`${p.meta_description_template}\``);
    if (p.target_keyword_template) lines.push(`- **Target keyword template:** \`${p.target_keyword_template}\``);
    lines.push('');
  }

  lines.push('#### Data');
  lines.push('');
  lines.push(`- **Source:** ${p.data_source}`);
  if (p.unique_content_per_page) lines.push(`- **Unique per page:** ${p.unique_content_per_page}`);
  lines.push('');

  if (p.example_pages.length > 0) {
    lines.push('#### Example URLs');
    lines.push('');
    for (const ex of p.example_pages) lines.push(`- ${ex}`);
    lines.push('');
  }

  if (p.required_sections.length > 0) {
    lines.push('#### Required page sections');
    lines.push('');
    lines.push('| Section | Min words | Purpose |');
    lines.push('|---------|-----------|---------|');
    for (const s of p.required_sections) {
      lines.push(`| ${escapeCell(s.section)} | ${s.min_words} | ${escapeCell(s.purpose)} |`);
    }
    lines.push('');
  }

  if (p.schema_markup.length > 0) {
    lines.push(`**Schema types per page:** ${p.schema_markup.map(s => `\`${s}\``).join(', ')}`);
    lines.push('');
  }

  if (p.thin_content_guards.length > 0) {
    lines.push('#### Thin-content guardrails');
    lines.push('');
    for (const g of p.thin_content_guards) lines.push(`- ${g}`);
    lines.push('');
  }

  if (p.internal_linking_strategy) {
    lines.push('#### Internal linking strategy');
    lines.push('');
    lines.push(p.internal_linking_strategy);
    lines.push('');
  }

  if (p.launch_checklist.length > 0) {
    lines.push('#### Launch checklist');
    lines.push('');
    p.launch_checklist.forEach(step => lines.push(`- [ ] ${step}`));
    lines.push('');
  }

  if (p.implementation_notes) {
    lines.push('#### Implementation notes');
    lines.push('');
    lines.push(p.implementation_notes);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  return lines;
}

function escapeCell(s: string): string {
  return (s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}
