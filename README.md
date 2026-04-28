# serpIQ

> The only SEO audit tool that reads your codebase first, then pulls your real Google Search Console data.

`serpiq` is a zero-install CLI that reads your project, pulls real Google Search Console data, does keyword research, and outputs an actionable SEO plan, including ready-to-implement blog briefs and pSEO page specs.

Bring your own LLM: **Anthropic**, **OpenAI**, **OpenRouter** (400+ models behind one key), any other **OpenAI-compatible** API (Groq, Together, Mistral, etc.), or a local **Ollama** model.

```bash
npx serpiq audit --site https://yoursite.com
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

## Quick start

```bash
# 1. Authenticate with Google Search Console (one time)
npx serpiq auth

# 2. Optional: Create a product context file the AI can read
npx serpiq init

# 3. Run the audit
npx serpiq audit --site https://yoursite.com
```

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
npx serpiq audit --site https://yoursite.com

# OpenAI
export OPENAI_API_KEY=sk-...
npx serpiq audit --provider openai --site https://yoursite.com

# OpenRouter: one key for 400+ models
export OPENROUTER_API_KEY=sk-or-...
npx serpiq audit \
  --provider openrouter \
  --model openai/gpt-4o \
  --site https://yoursite.com

# Groq (or any other OpenAI-compatible API)
export OPENAI_API_KEY=gsk_...
npx serpiq audit \
  --provider openai-compatible \
  --base-url https://api.groq.com/openai/v1 \
  --model llama-3.3-70b-versatile \
  --site https://yoursite.com

# Local Ollama: no API key needed
ollama pull llama3
npx serpiq audit --provider ollama --site https://yoursite.com
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
| `--site <url>`      | GSC property URL (cached after first use)                                                |                |
| `--days <number>`   | GSC lookback period                                                                      | `90`           |
| `--skip-gsc`        | Run without GSC (codebase analysis + keyword research only)                              | `false`        |
| `--output <path>`   | Output directory                                                                         | `./.serpiq`    |
| `--provider <name>` | LLM provider: `anthropic`, `openai`, `openrouter`, `openai-compatible`, `ollama`         | `anthropic`    |
| `--model <name>`    | LLM model name (provider-specific default if omitted)                                    | _see table_    |
| `--base-url <url>`  | Base URL for `openai-compatible` providers, or a remote Ollama instance                  |                |
| `--api-key <key>`   | LLM API key for this run only (overrides env var and saved config; **not persisted**)    |                |

The `--site` value can be either a domain property (`sc-domain:example.com`) or a URL prefix property (`https://example.com/`). `serpiq` auto-detects which one is verified in your account.

`--provider` and `--model` are persisted to `~/.serpiq/config.json` once set, so subsequent runs don't need them.

### `serpiq auth`

Run the OAuth flow against Google. Opens a browser, captures the redirect on `localhost:9999/callback`, and stores a refresh token.

### `serpiq init`

Drop a `.serpiq.md` template in the current directory. Fill it in and commit it. It gives the AI extra context the codebase can't reveal (competitors, audience, goals).

## How it works

`serpiq` runs five steps:

1. **Understand the codebase.** Reads `README.md`, `package.json`, your landing page, sitemap, robots.txt, `.serpiq.md`, and the directory tree. Sends it to your LLM to produce a structured product summary.
2. **Fetch GSC data.** Pulls 90 days of query and page data from Search Console, computes striking-distance keywords, low-CTR opportunities, and declining pages.
3. **Keyword research.** Scrapes Google Autocomplete for every seed keyword and asks the LLM to expand into long-tails, "vs" comparisons, use-case keywords, and pSEO templates.
4. **AI analysis.** Sends everything to the LLM for a prioritised audit with quick fixes, content improvements, blog briefs, pSEO plans, and technical issues.
5. **Write outputs.** Generates the markdown audit, JSON dump, individual blog briefs, and pSEO plan.

The LLM layer is a thin abstraction in `src/lib/llm.ts` with a single `complete(prompt, systemPrompt)` method, so swapping providers is a one-line change.

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
