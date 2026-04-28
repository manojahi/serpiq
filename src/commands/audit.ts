import path from 'node:path';
import fs from 'node:fs';
import ora from 'ora';
import chalk from 'chalk';
import boxen from 'boxen';
import { resolveLLMConfig, readConfig, writeConfig, confirm } from '../lib/config.js';
import { createLLMClient } from '../lib/llm.js';
import { appendToGitignore, ensureDir } from '../lib/fs.js';
import { understandCodebase } from '../steps/01-understand.js';
import { fetchGSCReport } from '../steps/02-gsc.js';
import { researchKeywords } from '../steps/03-keywords.js';
import { analyseSEO } from '../steps/04-analyse.js';
import { writeOutputs } from '../steps/05-output.js';
import type { AuditOptions, GSCReport } from '../types.js';

export async function auditCommand(opts: AuditOptions): Promise<void> {
  const cwd = path.resolve(opts.cwd);
  const outputDir = path.resolve(cwd, opts.output);

  console.log(chalk.bold.cyan('\nserpIQ') + chalk.dim(' - AI-powered SEO audit\n'));

  const config = readConfig();
  let site = opts.site || config.default_site;
  if (site && site !== config.default_site) {
    config.default_site = site;
    writeConfig(config);
  }

  const llmConfig = await resolveLLMConfig({
    provider: opts.provider,
    model: opts.model,
    baseURL: opts.baseUrl,
    apiKey: opts.apiKey,
  });
  const llm = createLLMClient(llmConfig);
  console.log(chalk.dim(`LLM: ${llm.provider} (${llm.model})`));

  const gitignorePath = path.join(cwd, '.gitignore');
  const ignored = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf8').split(/\r?\n/).map(l => l.trim()).includes('.serpiq/')
    : false;
  if (!ignored) {
    const ok = await confirm(`Add ${chalk.cyan('.serpiq/')} to .gitignore? (it contains GSC data)`, true);
    if (ok) {
      const added = appendToGitignore(cwd, '.serpiq/');
      if (added) console.log(chalk.green('✔ Updated .gitignore'));
    }
  }

  const step1 = ora('Analysing codebase...').start();
  let product;
  try {
    product = await understandCodebase(cwd, llm);
    step1.succeed(`Codebase analysed: ${chalk.bold(product.product_name)} (${product.product_description})`);
  } catch (e) {
    step1.fail('Codebase analysis failed');
    throw e;
  }

  let gsc: GSCReport | null = null;
  if (opts.skipGsc) {
    console.log(chalk.yellow('⚠ Skipping GSC (--skip-gsc)'));
  } else if (!site) {
    console.log(chalk.yellow('⚠ No --gsc-site provided; skipping GSC. Pass --gsc-site sc-domain:yoursite.com to include real performance data.'));
  } else {
    const step2 = ora(`Fetching GSC data for ${site}...`).start();
    try {
      gsc = await fetchGSCReport(site, opts.days);
      step2.succeed(
        `GSC data fetched: ${chalk.bold(gsc.topQueries.length)} queries, ${chalk.bold(gsc.topPages.length)} pages, last ${opts.days} days`
      );
    } catch (e) {
      step2.warn(`GSC fetch failed: ${(e as Error).message}`);
      console.log(chalk.dim('Continuing without GSC data. Run `npx serpiq auth` to authenticate.'));
    }
  }

  const step3 = ora('Researching keywords...').start();
  let keywords;
  try {
    keywords = await researchKeywords(product, gsc, llm);
    const total =
      keywords.quick_wins.length +
      keywords.blog_opportunities.length +
      keywords.competitor_gaps.length +
      keywords.pseo_templates.reduce((a, b) => a + (b.estimated_pages || 1), 0);
    step3.succeed(`Keyword research complete: ${chalk.bold(total)} opportunities identified`);
  } catch (e) {
    step3.fail('Keyword research failed');
    throw e;
  }

  let step4 = ora('Running strategic audit...').start();
  let audit;
  try {
    audit = await analyseSEO(product, gsc, keywords, llm, {
      onStrategicComplete: s => {
        step4.succeed(
          `Strategy ready: ${chalk.bold(s.quick_fixes.length)} quick fixes, ${chalk.bold(s.blog_brief_seeds.length)} blog seeds, ${chalk.bold(s.pseo_seeds.length)} pSEO seeds`
        );
        const total = s.blog_brief_seeds.length + s.pseo_seeds.length;
        if (total > 0) {
          step4 = ora(`Expanding ${total} briefs and pSEO templates in parallel...`).start();
        }
      },
      onBriefComplete: (i, total, title) => {
        step4.text = `Expanded brief ${i + 1}/${total}: ${title.slice(0, 50)}`;
      },
      onPseoComplete: (i, total, name) => {
        step4.text = `Expanded pSEO ${i + 1}/${total}: ${name.slice(0, 50)}`;
      },
    });
    step4.succeed(
      `Audit complete: ${chalk.bold(audit.blog_briefs.length)} briefs and ${chalk.bold(audit.pseo_plan.length)} pSEO templates expanded`
    );
  } catch (e) {
    step4.fail('Audit generation failed');
    throw e;
  }

  const step5 = ora('Writing outputs...').start();
  ensureDir(outputDir);
  const paths = writeOutputs(outputDir, { product, gsc, keywords, audit });
  step5.succeed(`Outputs written to ${chalk.cyan(path.relative(cwd, outputDir) || '.')}`);

  const totalPseoPages = audit.pseo_plan.reduce((a, b) => a + (b.estimated_pages || 0), 0);
  const summary = [
    chalk.bold.cyan('serpIQ Audit Complete'),
    `Health Score: ${chalk.bold(audit.health_score + '/100')}`,
    '',
    `${chalk.bold(audit.quick_fixes.length)} quick fixes identified`,
    `${chalk.bold(audit.blog_briefs.length)} blog briefs ready`,
    `${chalk.bold(audit.pseo_plan.length)} pSEO templates (est. ${totalPseoPages} pages)`,
    '',
    `Full report: ${chalk.cyan(path.relative(cwd, paths.auditMd) || paths.auditMd)}`,
  ].join('\n');

  console.log('\n' + boxen(summary, { padding: 1, borderColor: 'cyan', borderStyle: 'round' }));
}
