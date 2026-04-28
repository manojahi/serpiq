import path from 'node:path';
import type { LLMClient } from '../lib/llm.js';
import { extractJSON } from '../lib/json.js';
import { findFirstByGlob, findFirstExisting, listTopDirs, takeLines } from '../lib/fs.js';
import type { ProductContext } from '../types.js';

const SYSTEM_PROMPT = `You are an expert SEO strategist. You are being given context about a software product extracted from its codebase.
Your job is to produce a structured product summary that will guide the rest of the SEO audit.

Return a JSON object with these fields:
{
  "product_name": "string",
  "product_description": "1-2 sentence plain English description",
  "product_category": "e.g. SaaS, developer tool, e-commerce, blog, marketplace",
  "target_audience": ["string"],
  "core_features": ["string"],
  "tech_stack": ["string"],
  "existing_pages": ["string: list any page routes you can identify"],
  "content_gaps": ["string: obvious missing pages or sections"],
  "initial_keyword_seeds": ["5-10 seed keywords you'd use to start research for this product"]
}

Return ONLY the JSON. No preamble, no markdown fences.`;

const APPROX_CHARS_PER_TOKEN = 4;
const MAX_TOKENS = 6000;
const MAX_CHARS = MAX_TOKENS * APPROX_CHARS_PER_TOKEN;

interface FileChunk {
  label: string;
  content: string;
  priority: number;
}

export async function understandCodebase(cwd: string, llm: LLMClient): Promise<ProductContext> {
  const chunks: FileChunk[] = [];

  const readme = findFirstExisting(cwd, ['README.md', 'readme.md', 'Readme.md']);
  if (readme) chunks.push({ label: `# ${readme.path}`, content: readme.content, priority: 1 });

  const pkg = findFirstExisting(cwd, ['package.json']);
  if (pkg) {
    let trimmed = pkg.content;
    try {
      const parsed = JSON.parse(pkg.content);
      const subset = {
        name: parsed.name,
        description: parsed.description,
        keywords: parsed.keywords,
        homepage: parsed.homepage,
        scripts: parsed.scripts,
        dependencies: parsed.dependencies,
        devDependencies: parsed.devDependencies,
      };
      trimmed = JSON.stringify(subset, null, 2);
    } catch {}
    chunks.push({ label: `# ${pkg.path}`, content: trimmed, priority: 2 });
  }

  const userContext = findFirstExisting(cwd, ['.serpiq.md', '.seo-pilot.md', 'CLAUDE.md', 'AGENTS.md']);
  if (userContext) chunks.push({ label: `# ${userContext.path} (user-provided product context)`, content: userContext.content, priority: 0 });

  const landing = await findFirstByGlob(cwd, [
    'pages/index.tsx',
    'pages/index.jsx',
    'pages/index.js',
    'pages/index.ts',
    'app/page.tsx',
    'app/page.jsx',
    'app/page.js',
    'src/app/page.tsx',
    'src/pages/index.tsx',
    'src/App.tsx',
    'src/App.jsx',
    'src/main.tsx',
    'index.html',
    'public/index.html',
    'src/routes/+page.svelte',
    'src/routes/index.tsx',
  ]);
  if (landing) {
    chunks.push({
      label: `# ${landing.path} (first 100 lines)`,
      content: takeLines(landing.content, 100),
      priority: 3,
    });
  }

  const sitemap = findFirstExisting(cwd, ['public/sitemap.xml', 'sitemap.xml', 'static/sitemap.xml']);
  if (sitemap) {
    chunks.push({ label: `# ${sitemap.path}`, content: takeLines(sitemap.content, 200), priority: 4 });
  }

  const robots = findFirstExisting(cwd, ['public/robots.txt', 'robots.txt', 'static/robots.txt']);
  if (robots) chunks.push({ label: `# ${robots.path}`, content: robots.content, priority: 5 });

  const dirs = await listTopDirs(cwd, 2);
  if (dirs.length > 0) {
    chunks.push({
      label: '# directory structure (2 levels deep)',
      content: dirs.slice(0, 200).join('\n'),
      priority: 6,
    });
  }

  chunks.sort((a, b) => a.priority - b.priority);
  let total = 0;
  const kept: FileChunk[] = [];
  for (const chunk of chunks) {
    const block = `${chunk.label}\n\n${chunk.content}\n\n`;
    if (total + block.length > MAX_CHARS) {
      const remaining = MAX_CHARS - total;
      if (remaining > 500) {
        kept.push({
          label: chunk.label,
          content: chunk.content.slice(0, remaining - chunk.label.length - 50) + '\n... (truncated)',
          priority: chunk.priority,
        });
      }
      break;
    }
    kept.push(chunk);
    total += block.length;
  }

  if (kept.length === 0) {
    throw new Error('Could not find any project context. Run from your project root or create a .serpiq.md file describing your product.');
  }

  const userContent =
    'Here is the project context extracted from the codebase:\n\n' +
    kept.map(c => `${c.label}\n\n${c.content}`).join('\n\n---\n\n');

  const raw = await llm.complete(userContent, SYSTEM_PROMPT);

  const parsed = extractJSON(raw) as ProductContext;

  parsed.target_audience ??= [];
  parsed.core_features ??= [];
  parsed.tech_stack ??= [];
  parsed.existing_pages ??= [];
  parsed.content_gaps ??= [];
  parsed.initial_keyword_seeds ??= [];

  return parsed;
}
