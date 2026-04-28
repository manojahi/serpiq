#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { auditCommand } from './commands/audit.js';
import { authCommand } from './commands/auth.js';
import { initCommand } from './commands/init.js';
import type { LLMProviderName } from './types.js';

const VALID_PROVIDERS: LLMProviderName[] = ['anthropic', 'openai', 'openai-compatible', 'openrouter', 'ollama'];

const program = new Command();

program
  .name('serpiq')
  .description('serpIQ - AI-powered SEO audit for any codebase')
  .version('0.1.0');

program
  .command('audit')
  .description('Run a full AI-powered SEO audit on the current project')
  .option('--site <url>', 'Google Search Console property URL (cached after first use)')
  .option('--days <number>', 'GSC lookback period in days', val => parseInt(val, 10), 90)
  .option('--skip-gsc', 'Skip Google Search Console data (codebase + keyword research only)', false)
  .option('--output <path>', 'Output directory', './.serpiq')
  .option('--provider <name>', `LLM provider: ${VALID_PROVIDERS.join(', ')}`)
  .option('--model <name>', 'LLM model name (provider-specific default if omitted)')
  .option('--base-url <url>', 'Base URL (for openai-compatible or remote ollama)')
  .option('--api-key <key>', 'LLM API key (overrides env var and saved config; not persisted)')
  .action(async opts => {
    try {
      let provider: LLMProviderName | undefined;
      if (opts.provider) {
        if (!VALID_PROVIDERS.includes(opts.provider)) {
          throw new Error(`Invalid --provider "${opts.provider}". Valid: ${VALID_PROVIDERS.join(', ')}`);
        }
        provider = opts.provider as LLMProviderName;
      }
      await auditCommand({
        site: opts.site,
        days: opts.days,
        skipGsc: opts.skipGsc,
        output: opts.output,
        cwd: process.cwd(),
        provider,
        model: opts.model,
        baseUrl: opts.baseUrl,
        apiKey: opts.apiKey,
      });
    } catch (e) {
      console.error(chalk.red('\nserpiq failed:'), (e as Error).message);
      if (process.env.SERPIQ_DEBUG) console.error(e);
      process.exit(1);
    }
  });

program
  .command('auth')
  .description('Authenticate with Google Search Console')
  .action(async () => {
    try {
      await authCommand();
    } catch (e) {
      console.error(chalk.red('\nAuth failed:'), (e as Error).message);
      if (process.env.SERPIQ_DEBUG) console.error(e);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Create a .serpiq.md product context template in the current directory')
  .action(async () => {
    try {
      await initCommand(process.cwd());
    } catch (e) {
      console.error(chalk.red('\nInit failed:'), (e as Error).message);
      process.exit(1);
    }
  });

program.parseAsync(process.argv).catch(err => {
  console.error(chalk.red('Unexpected error:'), err);
  process.exit(1);
});
