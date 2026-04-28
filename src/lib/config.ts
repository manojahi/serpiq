import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import chalk from 'chalk';
import type { SeoPilotConfig, GoogleCredentials, LLMProviderName } from '../types.js';
import { DEFAULT_MODELS, type LLMConfig } from './llm.js';

const CONFIG_DIR = path.join(os.homedir(), '.serpiq');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json');
const LEGACY_CONFIG_DIR = path.join(os.homedir(), '.seo-pilot');

function migrateLegacyConfigDir(): void {
  if (fs.existsSync(CONFIG_DIR)) return;
  if (!fs.existsSync(LEGACY_CONFIG_DIR)) return;
  try {
    fs.renameSync(LEGACY_CONFIG_DIR, CONFIG_DIR);
  } catch {}
}

migrateLegacyConfigDir();

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function readConfig(): SeoPilotConfig {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as SeoPilotConfig;
  } catch {
    return {};
  }
}

export function writeConfig(config: SeoPilotConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function readCredentials(): GoogleCredentials | null {
  ensureConfigDir();
  if (!fs.existsSync(CREDENTIALS_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8')) as GoogleCredentials;
  } catch {
    return null;
  }
}

export function writeCredentials(creds: GoogleCredentials): void {
  ensureConfigDir();
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function getConfigPaths() {
  return { CONFIG_DIR, CONFIG_PATH, CREDENTIALS_PATH };
}

function prompt(question: string, mask = false): Promise<string> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (mask) {
      const stdin = process.stdin;
      process.stdout.write(question);
      let value = '';
      const onData = (chunk: Buffer) => {
        const ch = chunk.toString('utf8');
        if (ch === '\n' || ch === '\r' || ch === '\u0004') {
          stdin.removeListener('data', onData);
          if (typeof (stdin as any).setRawMode === 'function') (stdin as any).setRawMode(false);
          stdin.pause();
          process.stdout.write('\n');
          rl.close();
          resolve(value);
        } else if (ch === '\u0003') {
          process.exit(0);
        } else if (ch === '\u007f' || ch === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          value += ch;
          process.stdout.write('*');
        }
      };
      if (typeof (stdin as any).setRawMode === 'function') (stdin as any).setRawMode(true);
      stdin.resume();
      stdin.on('data', onData);
    } else {
      rl.question(question, answer => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

const PROVIDER_ENV: Record<LLMProviderName, string | null> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  'openai-compatible': 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  ollama: null,
};

const PROVIDER_LABEL: Record<LLMProviderName, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  'openai-compatible': 'OpenAI-compatible',
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
};

function readProviderKey(cfg: SeoPilotConfig, provider: LLMProviderName): string | undefined {
  if (provider === 'ollama') return undefined;
  const fromMap = cfg.llm_api_keys?.[provider];
  if (fromMap && fromMap.trim()) return fromMap.trim();
  if (provider === 'anthropic' && cfg.anthropic_api_key && cfg.anthropic_api_key.trim()) {
    return cfg.anthropic_api_key.trim();
  }
  return undefined;
}

function saveProviderKey(cfg: SeoPilotConfig, provider: LLMProviderName, key: string): SeoPilotConfig {
  if (provider === 'ollama') return cfg;
  const next = { ...cfg, llm_api_keys: { ...(cfg.llm_api_keys ?? {}) } };
  next.llm_api_keys![provider] = key;
  if (provider === 'anthropic') next.anthropic_api_key = key;
  return next;
}

export interface ResolveLLMOptions {
  provider?: LLMProviderName;
  model?: string;
  baseURL?: string;
  apiKey?: string;
}

export async function resolveLLMConfig(opts: ResolveLLMOptions = {}): Promise<LLMConfig> {
  const cfg = readConfig();
  const provider: LLMProviderName = opts.provider ?? cfg.llm_provider ?? 'anthropic';
  const model = opts.model ?? cfg.llm_model ?? DEFAULT_MODELS[provider];
  let baseURL = opts.baseURL ?? cfg.llm_base_url;

  let apiKey: string | undefined;
  if (provider !== 'ollama') {
    const envName = PROVIDER_ENV[provider];
    if (opts.apiKey && opts.apiKey.trim()) {
      apiKey = opts.apiKey.trim();
    } else {
      const envKey = envName ? process.env[envName]?.trim() : undefined;
      apiKey = envKey || readProviderKey(cfg, provider);
    }

    if (!apiKey) {
      console.log(chalk.yellow(`\nNo ${PROVIDER_LABEL[provider]} API key found.`));
      if (envName) {
        console.log(`Set it as an environment variable:  ${chalk.cyan(`export ${envName}=...`)}`);
      }
      console.log(`Or enter it now (stored in ${chalk.dim('~/.serpiq/config.json')}):`);
      apiKey = (await prompt('API key: ', true)).trim();
      if (!apiKey) {
        console.error(chalk.red('No API key provided. Aborting.'));
        process.exit(1);
      }
      const updated = saveProviderKey(cfg, provider, apiKey);
      writeConfig(updated);
      console.log(chalk.green('✔ Saved.'));
    }
  }

  if (provider === 'openai-compatible' && !baseURL) {
    console.log(chalk.yellow('\nopenai-compatible providers need a base URL.'));
    console.log(chalk.dim('Examples: https://api.groq.com/openai/v1, https://openrouter.ai/api/v1'));
    baseURL = (await prompt('Base URL: ')).trim();
    if (!baseURL) {
      console.error(chalk.red('No base URL provided. Aborting.'));
      process.exit(1);
    }
    const next = readConfig();
    next.llm_base_url = baseURL;
    writeConfig(next);
  }

  const persisted = readConfig();
  let dirty = false;
  if (persisted.llm_provider !== provider) {
    persisted.llm_provider = provider;
    dirty = true;
  }
  if (opts.model && persisted.llm_model !== model) {
    persisted.llm_model = model;
    dirty = true;
  }
  if (dirty) writeConfig(persisted);

  return { provider, model, apiKey, baseURL };
}

export async function promptText(question: string): Promise<string> {
  return (await prompt(question)).trim();
}

export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] ';
  const answer = (await prompt(question + suffix)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer === 'y' || answer === 'yes';
}
