# serpIQ

[![npm version](https://img.shields.io/npm/v/serpiq?style=flat-square&color=22d3ee&label=npm)](https://www.npmjs.com/package/serpiq)
[![npm downloads](https://img.shields.io/npm/dm/serpiq?style=flat-square&color=22d3ee)](https://www.npmjs.com/package/serpiq)
[![License: MIT](https://img.shields.io/npm/l/serpiq?style=flat-square&color=22d3ee)](https://github.com/manojahi/serpiq/blob/main/LICENSE)
[![Node](https://img.shields.io/node/v/serpiq?style=flat-square&color=22d3ee)](https://nodejs.org)
[![GitHub stars](https://img.shields.io/github/stars/manojahi/serpiq?style=flat-square&color=22d3ee)](https://github.com/manojahi/serpiq)

> The only SEO audit tool that reads your codebase first, then pulls your real Google Search Console data.

`serpiq` is a zero-install CLI that reads your project, pulls real Google Search Console data, does keyword research, and outputs an actionable SEO plan, including ready-to-implement blog briefs and pSEO page specs.

Bring your own LLM: **Anthropic**, **OpenAI**, **OpenRouter** (400+ models behind one key), any other **OpenAI-compatible** API (Groq, Together, Mistral, etc.), or a local **Ollama** model.

```bash
npx serpiq audit --gsc-site sc-domain:yoursite.com
```

[View on npm](https://www.npmjs.com/package/serpiq) · [GitHub](https://github.com/manojahi/serpiq)

## Why serpIQ

Every other SEO tool audits your live website. serpIQ is different in two ways.

**1. It reads your codebase first.**
Before touching any SEO data, serpIQ reads your README, package.json, and landing page to understand what your product actually does. The audit is product-aware, not just a generic HTML crawl.

**2. It uses your real GSC data.**
No third-party keyword estimates. serpIQ connects directly to your Google Search Console account and pulls your actual impressions, clicks, and positions for the last 90 days. You see the truth about your site, not a vendor's model of it.

Everything else follows from these two things.

## What you get

After running an audit, `serpiq` writes everything to `.serpiq/` in your project:

```
.serpiq/
├── audit-2026-04-28.md          # The main human-readable report
├── audit-2026-04-28.json        # Same data, machine-readable
├── blog-briefs/
│   └── brief-{slug}.md          # One brief per blog post the AI recommends
└── pseo/
    └── pseo-plan.md             # Programmatic SEO templates with URL patterns,
                                  # data sources, and example pages
```

The audit covers:

- **Health score** (0 to 100) for your current SEO
- **Quick fixes** prioritised by impact (title tags, meta descriptions, H1s)
- **Striking-distance keywords**: queries ranking 8 to 20 with real impressions
- **High-impression, low-CTR queries**: easy CTR wins from snippet rewrites
- **Blog content plan**: full briefs with target keywords, intent, outlines
- **pSEO templates**: programmatic page templates with URL patterns and data sources
- **Technical issues** found in your code (missing meta, sitemap, robots, etc.)
- **Declining pages** if you have 60+ days of GSC history

## Installation

Pick the option that fits your workflow.

### Option 1: Run with `npx` (no install)

```bash
npx serpiq audit --gsc-site sc-domain:yoursite.com
```

`npx` will fetch the latest version each time. Best for one-off runs.

### Option 2: Install globally

```bash
npm install -g serpiq
serpiq audit --gsc-site sc-domain:yoursite.com
```

The `serpiq` command becomes available everywhere on your machine.

### Option 3: Install in your project

```bash
npm install --save-dev serpiq
npx serpiq audit --gsc-site sc-domain:yoursite.com
```

Pin the version in your `package.json`. Run via `npx` or wire into a npm script:

```json
{
  "scripts": {
    "audit": "serpiq audit --gsc-site sc-domain:yoursite.com"
  }
}
```

## Quick start

```bash
# 1. Authenticate with Google Search Console (one time)
npx serpiq auth

# 2. Optional: Create a product context file the AI can read
npx serpiq init

# 3. Run the audit
npx serpiq audit --gsc-site sc-domain:yoursite.com
```

> Don't have a Google Search Console site yet? Add `--skip-gsc` and serpIQ will run on codebase analysis and keyword research alone.

## Setup

### 1. Pick an LLM provider

`serpiq` uses an LLM for product understanding, keyword research, and the strategy report. You choose the provider.

| Provider             | Default model                  | API key env var       | Notes                                                                  |
| -------------------- | ------------------------------ | --------------------- | ---------------------------------------------------------------------- |
| `anthropic`          | `claude-sonnet-4-5`            | `ANTHROPIC_API_KEY`   | Best quality. Recommended.                                             |
| `openai`             | `gpt-4o`                       | `OPENAI_API_KEY`      |                                                                        |
| `openrouter`         | `anthropic/claude-sonnet-4.5`  | `OPENROUTER_API_KEY`  | One key, 400+ models. Pass `--model openai/gpt-4o` to switch.          |
| `openai-compatible`  | `gpt-4o`                       | `OPENAI_API_KEY`      | Pass `--base-url` for Groq, Together, Mistral, etc.                    |
| `ollama`             | `llama3`                       | _none_                | Runs locally at `http://localhost:11434`. Free.                        |

Default is `anthropic`. To switch, pass `--provider` once and it gets saved to `~/.serpiq/config.json` and reused next time.

```bash
# Anthropic (default)
export ANTHROPIC_API_KEY=sk-ant-...
npx serpiq audit --gsc-site sc-domain:yoursite.com

# OpenAI
export OPENAI_API_KEY=sk-...
npx serpiq audit --provider openai --gsc-site sc-domain:yoursite.com

# OpenRouter: one key for 400+ models
export OPENROUTER_API_KEY=sk-or-...
npx serpiq audit \
  --provider openrouter \
  --model openai/gpt-4o \
  --gsc-site sc-domain:yoursite.com

# Groq (or any other OpenAI-compatible API)
export OPENAI_API_KEY=gsk_...
npx serpiq audit \
  --provider openai-compatible \
  --base-url https://api.groq.com/openai/v1 \
  --model llama-3.3-70b-versatile \
  --gsc-site sc-domain:yoursite.com

# Local Ollama: no API key needed
ollama pull llama3
npx serpiq audit --provider ollama --gsc-site sc-domain:yoursite.com
```

If no API key is found for the selected provider, `serpiq` prompts you on first run and saves it (per-provider) to `~/.serpiq/config.json`. Ollama skips the prompt entirely.

You can also pass the key inline with `--api-key <key>` for one-off runs (this is not persisted to disk).

> **Quality note:** results are only as good as your model. Smaller local models (7B to 13B) produce noticeably weaker audits and may emit malformed JSON. Use Claude Sonnet 4.5 or GPT-4o when you can.

### 2. Google Search Console OAuth credentials

`serpiq` needs OAuth credentials to talk to your GSC account. You create these once in Google Cloud Console:

1. Go to <https://console.cloud.google.com/apis/credentials>.
2. Create (or reuse) a project.
3. Enable the **Search Console API** for the project.
4. Create credentials → **OAuth client ID** → **Desktop app** (or **Web application** with redirect URI `http://localhost:9999/callback`).
5. Copy the Client ID and Client Secret. `serpiq` will prompt for them on first auth and store them in `~/.serpiq/config.json`.

You only need to do this once per machine. Then run:

```bash
npx serpiq auth
```

A browser window opens, you authorize, and a refresh token is stored in `~/.serpiq/credentials.json` (gitignored automatically).

> **Verify your site in GSC first.** `serpiq` only reads properties you've already verified at <https://search.google.com/search-console>.

## CLI reference

### `serpiq audit`

Run a full audit.

```bash
serpiq audit [options]
```

| Option              | Description                                                                              | Default        |
| ------------------- | ---------------------------------------------------------------------------------------- | -------------- |
| `--gsc-site <prop>` | Google Search Console property (e.g. `sc-domain:example.com`). Cached after first use.   |                |
| `--days <number>`   | GSC lookback period                                                                      | `90`           |
| `--skip-gsc`        | Run without GSC (codebase analysis + keyword research only)                              | `false`        |
| `--output <path>`   | Output directory                                                                         | `./.serpiq`    |
| `--provider <name>` | LLM provider: `anthropic`, `openai`, `openrouter`, `openai-compatible`, `ollama`         | `anthropic`    |
| `--model <name>`    | LLM model name (provider-specific default if omitted)                                    | _see table_    |
| `--base-url <url>`  | Base URL for `openai-compatible` providers, or a remote Ollama instance                  |                |
| `--api-key <key>`   | LLM API key for this run only (overrides env var and saved config; **not persisted**)    |                |

The `--gsc-site` value can be either a domain property (`sc-domain:example.com`) or a URL prefix property (`https://example.com/`). `serpiq` auto-detects which one is verified in your account. The flag is named `--gsc-site` to make it clear this is a Google Search Console property reference, not a URL to crawl - serpIQ does not crawl your live site.

`--provider` and `--model` are persisted to `~/.serpiq/config.json` once set, so subsequent runs don't need them.

### `serpiq auth`

Run the OAuth flow against Google. Opens a browser, captures the redirect on `localhost:9999/callback`, and stores a refresh token.

### `serpiq init`

Drop a `.serpiq.md` template in the current directory. Fill it in and commit it. It gives the AI extra context the codebase can't reveal (competitors, audience, goals).

## How it works

`serpiq` runs five steps. Each one is a single TypeScript file under `src/steps/`.

### 1. Understand the codebase
The LLM reads your `README.md`, `package.json`, landing page HTML, sitemap, `robots.txt`, `.serpiq.md`, and the directory tree, then returns a structured product summary including initial keyword seeds and content gaps the codebase reveals.

### 2. Fetch GSC data + diagnose stage
Pulls 90 days of query and page data from Search Console (configurable via `--days`). Then computes purely-deterministic signals from the raw data:

- **Stage diagnosis**: classifies the site into one of six stages (`no_data`, `low_visibility`, `visibility_no_clicks`, `rank_improvement`, `has_traction`, `scaling`). Drives the entire downstream strategy.
- **Adaptive thresholds**: striking-distance and low-CTR cutoffs scale with site size, so small sites don't get filtered out by big-site defaults.
- **URL pattern detection**: groups your top pages by parent path to surface existing pSEO clusters (`/decline-codes/*`, `/alternatives/*`, etc.).
- **Per-page query map**: for the top 40 pages, lists the top 5 queries each page is showing for. This is the input that drives smart title/meta rewrites.

### 3. Keyword research
Scrapes **Google Autocomplete** for every seed keyword (real Google data, not LLM hallucination), then asks the LLM to expand the seeds + GSC striking-distance keywords + autocomplete data into quick wins, blog opportunities, pSEO templates, and competitor gaps.

### 4. AI analysis (split into focused calls)
A single giant prompt would overwhelm small models. Instead:

1. **Strategic call**: produces the executive summary, health score, top 3 actions, quick fixes, content improvements, internal links, keyword clusters, technical issues. Plus *seeds* for blog briefs and pSEO templates.
2. **Per-brief expansion** (parallel): one focused LLM call per blog brief seed, producing meta tags, slug, 7-10 outline sections with word targets, FAQ, internal/external links, image suggestions, and schema markup.
3. **Per-pSEO expansion** (parallel): one focused call per pSEO seed, producing meta templates, required sections with min-word counts, thin-content guards, internal-linking strategy, and an 8-12 step launch checklist.

JSON mode is enabled for OpenAI-compatible providers and Ollama to enforce schema compliance.

### 5. Write outputs
Renders markdown for the main audit, every blog brief, and the pSEO plan. Each brief gets a universal SEO checklist appended (40+ items: meta tags, schema markup with copy-paste JSON-LD, performance, post-publish distribution). The pSEO plan gets a universal best-practices appendix (indexability, anti-thin-content rules, launch sequence, monitoring metrics).

The LLM layer is a thin abstraction in `src/lib/llm.ts` with a single `complete(prompt, systemPrompt, options)` method, so swapping providers is a one-line change.

## How keyword and gap detection works

serpIQ uses six layers of signal, mostly deterministic. The LLM only synthesizes on top of real data.

| Source                       | What it surfaces                                              | How                                       |
| ---------------------------- | ------------------------------------------------------------- | ----------------------------------------- |
| Codebase + landing page      | What your product *should* talk about; missing topics         | LLM-inferred from README, code, HTML      |
| GSC striking-distance        | Queries you're *almost* ranking for (pos 5-30)                | Threshold-based, scales with site size    |
| GSC high-impression-low-CTR  | SERP appearance issues (titles/metas to rewrite)              | Threshold-based, scales with site size    |
| GSC pages-with-queries       | Title-vs-actual-query mismatches per page                     | Joins page data with query data           |
| GSC URL pattern clustering   | Working pSEO clusters to expand (vs starting new ones)        | Groups top pages by parent path           |
| Google Autocomplete          | Real-world long-tail variants for each seed                   | Scrapes `suggestqueries.google.com`       |
| GSC declining pages          | Content rotting (last 30 vs prior 30 days)                    | Deterministic, requires `--days >= 60`    |
| LLM synthesis                | Competitor gaps, keyword clusters, internal-link gaps         | LLM uses all of the above as context      |

Two things serpIQ deliberately does not do:

- **No third-party keyword volume API** (Ahrefs / SEMrush / DataForSEO). Volume estimates are paid and noisy. The philosophy is "use your real GSC data plus free Google signals."
- **No live SERP scraping** of competitors. On the roadmap, but the current detection layers already give you actionable opportunities without it.

## Configuration files

| File                                | Purpose                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `~/.serpiq/config.json`             | Per-provider LLM API keys, default provider/model/base URL, default site, Google OAuth client      |
| `~/.serpiq/credentials.json`        | Google refresh token (mode `0600`)                                                                 |
| `.serpiq.md` _(in your repo)_       | Optional, user-written product context (competitors, audience, SEO goals). Read on every audit.    |
| `.serpiq/`  _(in your repo)_        | Audit outputs. Auto-added to `.gitignore` on first run (it contains raw GSC data).                 |

## Graceful degradation

If GSC auth fails or you pass `--skip-gsc`, the audit still runs using only codebase analysis and Google Autocomplete. The report will note that performance data was unavailable.

## Privacy

`serpiq` runs entirely on your machine. Your code excerpts and GSC data are sent to whichever LLM provider you choose, using your own API key. With `--provider ollama`, nothing leaves your machine at all.

## Contributing

PRs welcome. The code is small and split into one file per pipeline step in `src/steps/`. Open an issue first for non-trivial changes.

```bash
git clone https://github.com/manojahi/serpiq
cd serpiq
npm install
npm run build
node dist/index.js audit --skip-gsc   # local test
```

## Roadmap

- `serpiq generate-pseo`: scaffold the actual page files (Next.js, Astro, SvelteKit) from the pSEO plan
- Optional Bing Webmaster Tools integration
- Internal-link recommendations from sitemap analysis
- Crawl-based technical audit (lighthouse-style) for sites without GSC
- More native LLM providers (Gemini, Bedrock). Open a PR, the interface is one method.

## License

MIT

---

Built by [@manojahi](https://github.com/manojahi) · Follow [@manoj_ahi on X](https://x.com/manoj_ahi) for updates.
