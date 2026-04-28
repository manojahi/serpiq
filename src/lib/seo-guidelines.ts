import type { BlogBrief, PseoPlan } from '../types.js';

/**
 * Static, universal SEO guidelines we append to every brief and pSEO doc.
 * These are deterministic best practices so the AI doesn't waste tokens regenerating
 * the same checklist on every audit, and so the output stays consistent across runs.
 */

export function blogBriefAppendix(brief: BlogBrief, productName: string): string {
  const lines: string[] = [];

  lines.push('## On-Page SEO Implementation Checklist');
  lines.push('');
  lines.push('Use this as a hard checklist before publishing. Every item must be ticked.');
  lines.push('');
  lines.push('### Meta + URL');
  lines.push('- [ ] `<title>`: 50-60 characters, target keyword in first 30 chars, brand at end');
  lines.push('- [ ] `<meta name="description">`: 145-160 characters, contains target keyword and clear CTA');
  lines.push('- [ ] URL slug: 3-5 words, lowercase, hyphen-separated, contains target keyword, no stop words');
  lines.push('- [ ] Canonical URL set to self (`<link rel="canonical">`)');
  lines.push('- [ ] No `noindex` meta tag');
  lines.push('- [ ] Open Graph tags: `og:title`, `og:description`, `og:image` (1200x630), `og:type=article`');
  lines.push('- [ ] Twitter Card tags: `twitter:card=summary_large_image`, title, description, image');
  lines.push('');
  lines.push('### Content structure');
  lines.push('- [ ] Exactly one `<h1>` per page, contains primary keyword');
  lines.push('- [ ] Hierarchical `<h2>` / `<h3>` with semantic keywords (no skipping levels)');
  lines.push('- [ ] Primary keyword in first 100 words (above the fold)');
  lines.push('- [ ] Secondary keywords distributed naturally throughout, no stuffing');
  lines.push('- [ ] Target keyword density 0.8-1.5%, never above 2.5%');
  lines.push('- [ ] Table of Contents for posts >1000 words (anchored links to each H2)');
  lines.push('- [ ] Reading time estimate at top');
  lines.push('- [ ] Last updated date prominently displayed (rebuild trust + freshness signal)');
  lines.push('- [ ] Author byline with bio link (E-E-A-T signal)');
  lines.push('');
  lines.push('### Linking');
  lines.push('- [ ] 3-5 internal links to related cluster/pillar pages with descriptive anchor text');
  lines.push('- [ ] 1-3 external links to authoritative sources (`.edu`, `.gov`, original studies, vendor docs)');
  lines.push('- [ ] No broken links (run a link checker before publishing)');
  lines.push('- [ ] External links open in new tab where it makes sense (`target="_blank" rel="noopener"`)');
  lines.push('');
  lines.push('### Media');
  lines.push('- [ ] Hero image with descriptive alt text (no "image of", just describe + include keyword if natural)');
  lines.push('- [ ] All images have alt text; decorative images have `alt=""`');
  lines.push('- [ ] File names are keyword-rich and hyphen-separated (e.g. `dunning-email-template-saas.png`)');
  lines.push('- [ ] Images compressed (<200KB) and served as WebP or AVIF where supported');
  lines.push('- [ ] `loading="lazy"` on all below-the-fold images');
  lines.push('- [ ] Width/height attributes set to prevent CLS');
  lines.push('');
  lines.push('### Schema markup (JSON-LD)');
  if (brief.schema_markup.length > 0) {
    lines.push(`Add the following schema types: ${brief.schema_markup.map(s => `\`${s}\``).join(', ')}.`);
  }
  lines.push('- [ ] `Article` schema with author, datePublished, dateModified, image, mainEntityOfPage');
  if (brief.faq.length > 0) {
    lines.push('- [ ] `FAQPage` schema covering the FAQ section above');
  }
  if (brief.content_type === 'how_to') {
    lines.push('- [ ] `HowTo` schema with steps');
  }
  lines.push('- [ ] `BreadcrumbList` schema for the breadcrumb trail');
  lines.push('- [ ] Validate with [Rich Results Test](https://search.google.com/test/rich-results) before publish');
  lines.push('');
  lines.push('### Performance + Core Web Vitals');
  lines.push('- [ ] LCP < 2.5s (optimise hero image, preload critical assets)');
  lines.push('- [ ] CLS < 0.1 (set image dimensions, reserve space for ads/embeds)');
  lines.push('- [ ] INP < 200ms (defer non-critical JS)');
  lines.push('- [ ] Mobile-responsive (test at 375px, 768px, 1024px)');
  lines.push('- [ ] No render-blocking resources above the fold');
  lines.push('');
  lines.push('### Distribution and post-publish');
  lines.push('- [ ] Submit URL to Google Search Console (`URL Inspection > Request Indexing`)');
  lines.push('- [ ] Add to `sitemap.xml`');
  lines.push('- [ ] Internal-link to it from at least 2 existing high-traffic pages');
  lines.push('- [ ] Share on relevant communities (Reddit, Hacker News, Twitter, LinkedIn) - drive initial signals');
  lines.push('- [ ] Schedule a content refresh in 6 months (review rankings + update stats)');
  lines.push('');
  lines.push('## Recommended JSON-LD Schema');
  lines.push('');
  lines.push('Drop into `<head>`. Replace placeholders before publishing.');
  lines.push('');
  lines.push('```html');
  lines.push('<script type="application/ld+json">');
  lines.push(
    JSON.stringify(buildArticleSchema(brief, productName), null, 2)
  );
  lines.push('</script>');
  if (brief.faq.length > 0) {
    lines.push('<script type="application/ld+json">');
    lines.push(JSON.stringify(buildFAQSchema(brief), null, 2));
    lines.push('</script>');
  }
  lines.push('```');
  lines.push('');

  if (brief.featured_snippet_target.type !== 'none' && brief.featured_snippet_target.answer_template) {
    lines.push('## Featured Snippet Strategy');
    lines.push('');
    lines.push(`**Target query:** "${brief.featured_snippet_target.query}"  `);
    lines.push(`**Snippet type:** ${brief.featured_snippet_target.type}`);
    lines.push('');
    lines.push('**Snippet-ready answer (place near top of relevant section):**');
    lines.push('');
    lines.push('> ' + brief.featured_snippet_target.answer_template);
    lines.push('');
    lines.push(
      'Make sure the answer is 40-60 words for paragraph snippets, lives directly under the matching H2, and the H2 mirrors the search query closely.'
    );
    lines.push('');
  }

  lines.push('## Writing Guidelines');
  lines.push('');
  lines.push('- Write at a 7th-9th grade reading level (run through Hemingway or similar)');
  lines.push('- Short paragraphs (2-3 sentences max), short sentences (15-20 words avg)');
  lines.push('- Use bullet lists, numbered steps, and tables to break up text');
  lines.push('- First paragraph: state the answer/promise within 2 sentences (snippet bait)');
  lines.push('- Use active voice; avoid filler ("in this article we will explore")');
  lines.push('- Define jargon on first use, link to glossary if you have one');
  lines.push('- Original data, screenshots, and examples > generic stock content');
  lines.push('- End with a clear CTA (sign up, read related, contact, etc.)');
  lines.push('');

  return lines.join('\n');
}

function buildArticleSchema(brief: BlogBrief, productName: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: brief.meta_title || brief.title,
    description: brief.meta_description,
    keywords: [brief.target_keyword, ...brief.secondary_keywords].filter(Boolean).join(', '),
    author: {
      '@type': 'Organization',
      name: productName,
    },
    publisher: {
      '@type': 'Organization',
      name: productName,
    },
    datePublished: '{{ISO_DATE}}',
    dateModified: '{{ISO_DATE}}',
    image: '{{HERO_IMAGE_URL}}',
    mainEntityOfPage: '{{CANONICAL_URL}}',
  };
}

function buildFAQSchema(brief: BlogBrief): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: brief.faq.map(q => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.short_answer },
    })),
  };
}

export function pseoAppendix(_plan: PseoPlan[], productName: string): string {
  const lines: string[] = [];

  lines.push('## Universal pSEO Best Practices');
  lines.push('');
  lines.push('Every page in every template MUST satisfy these rules. Programmatic content that violates them gets de-indexed or treated as thin content.');
  lines.push('');

  lines.push('### Indexability + crawlability');
  lines.push('- Each page has a self-referencing canonical (`<link rel="canonical" href="{{currentUrl}}">`).');
  lines.push('- Robots meta: `index, follow` (NEVER `noindex` on revenue pages).');
  lines.push('- All template pages listed in `sitemap.xml`. Submit to GSC after launch.');
  lines.push('- Reachable from a category/index page within 2 clicks of homepage.');
  lines.push('- No more than 200 internal links per page.');
  lines.push('');

  lines.push('### Anti-thin-content guardrails');
  lines.push('- Minimum 600 unique words per page. Below that, do not generate the page.');
  lines.push('- At least 60% unique content per page (boilerplate <40%).');
  lines.push('- Skip variants with <50 estimated monthly searches; quality > quantity.');
  lines.push('- Build a `lastReviewedAt` field; refresh pages quarterly.');
  lines.push('- Track impressions per page in GSC. Pages with 0 impressions after 90 days should be `noindex`ed or merged.');
  lines.push('');

  lines.push('### Required template structure');
  lines.push('Every page in any pSEO template should include these blocks:');
  lines.push('1. **Hero**: H1 with primary keyword, 80-120 word intro answering the search intent within the first paragraph');
  lines.push('2. **Quick answer / TL;DR box**: snippet-bait paragraph, list, or table');
  lines.push('3. **Main content**: 3-5 sections of substantive content (250+ words each)');
  lines.push('4. **Comparison / data table**: drives table snippets and engagement');
  lines.push('5. **FAQ**: 4-6 questions tied to PAA boxes, FAQPage schema');
  lines.push('6. **Related pages cross-link block**: 4-8 related variants from same template');
  lines.push('7. **CTA**: clear next step (signup, related product page)');
  lines.push('8. **Breadcrumb**: with BreadcrumbList schema');
  lines.push('');

  lines.push('### Schema markup (every page)');
  lines.push('- `Article` or content-type-specific schema (`HowTo`, `Product`, `SoftwareApplication`)');
  lines.push('- `FAQPage` if FAQ section present');
  lines.push('- `BreadcrumbList` for breadcrumbs');
  lines.push('- `Organization` schema in site-wide layout');
  lines.push('- Validate with Rich Results Test before deploying template');
  lines.push('');

  lines.push('### Internal linking strategy for clusters');
  lines.push('- Hub-and-spoke: a single category/pillar page links to all variants. Each variant links back to the pillar.');
  lines.push('- Sibling links: each variant links to 4-8 related variants ("People also viewed").');
  lines.push('- Anchor text varied: mix exact-match, partial-match, and generic ("see all alternatives").');
  lines.push('- One contextual deep link from a high-authority page (e.g. blog post) per variant where possible.');
  lines.push('');

  lines.push('### Performance');
  lines.push('- Pre-render or ISR with revalidate for fresh data; pure client-side rendering hurts indexing.');
  lines.push('- Cache aggressively at CDN; `s-maxage` matched to data freshness need.');
  lines.push('- Lazy-load below-the-fold images and embeds.');
  lines.push('- Keep total JS bundle <150kb gz on these pages.');
  lines.push('');

  lines.push('### Launch sequence');
  lines.push('1. Build template with variable interpolation. Validate output for 5 sample pages.');
  lines.push('2. Deploy to staging behind `noindex` for QA. Test schema, mobile, performance.');
  lines.push('3. Launch first 10-50 pages, link from main nav or category landing.');
  lines.push('4. Submit URLs to GSC (`URL Inspection > Request Indexing` for the top 5 by search volume).');
  lines.push('5. Monitor weekly: indexing rate, impressions, CTR, position in GSC.');
  lines.push('6. Roll out remaining pages in batches of 50-200, watching for crawl budget impact.');
  lines.push('7. After 4 weeks, audit: pages with 0 impressions get reviewed for thin content; pages with high impressions but no clicks get title/meta optimised.');
  lines.push('');

  lines.push('### Monitoring metrics (set up before launch)');
  lines.push('- Indexing rate: % of submitted pages indexed in GSC');
  lines.push('- Impressions per template variant');
  lines.push('- CTR by template');
  lines.push('- Average position by template');
  lines.push('- Pages with 0 impressions after 90 days (cleanup candidates)');
  lines.push('- Pages with high impressions, low CTR (title/meta candidates)');
  lines.push('');

  lines.push('### Recommended JSON-LD Schema (per page)');
  lines.push('');
  lines.push('```html');
  lines.push('<script type="application/ld+json">');
  lines.push(
    JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: '{{H1}}',
        description: '{{META_DESCRIPTION}}',
        author: { '@type': 'Organization', name: productName },
        publisher: { '@type': 'Organization', name: productName },
        datePublished: '{{ISO_DATE}}',
        dateModified: '{{ISO_DATE}}',
        mainEntityOfPage: '{{CANONICAL_URL}}',
      },
      null,
      2
    )
  );
  lines.push('</script>');
  lines.push('<script type="application/ld+json">');
  lines.push(
    JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: '{{HOME_URL}}' },
          { '@type': 'ListItem', position: 2, name: '{{CATEGORY_NAME}}', item: '{{CATEGORY_URL}}' },
          { '@type': 'ListItem', position: 3, name: '{{H1}}', item: '{{CANONICAL_URL}}' },
        ],
      },
      null,
      2
    )
  );
  lines.push('</script>');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}
