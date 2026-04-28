import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export type LLMProvider = 'anthropic' | 'openai' | 'openai-compatible' | 'openrouter' | 'ollama';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseURL?: string;
}

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_HEADERS = {
  'HTTP-Referer': 'https://github.com/manojahi/serpiq',
  'X-Title': 'serpIQ',
};

export interface CompleteOptions {
  jsonMode?: boolean;
}

export interface LLMClient {
  readonly provider: LLMProvider;
  readonly model: string;
  complete(prompt: string, systemPrompt: string, options?: CompleteOptions): Promise<string>;
}

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4o',
  'openai-compatible': 'gpt-4o',
  openrouter: 'anthropic/claude-sonnet-4.5',
  ollama: 'llama3',
};

class AnthropicClient implements LLMClient {
  readonly provider = 'anthropic' as const;
  readonly model: string;
  private client: Anthropic;

  constructor(apiKey: string, model: string) {
    this.model = model;
    this.client = new Anthropic({ apiKey });
  }

  async complete(prompt: string, systemPrompt: string, _options?: CompleteOptions): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 16384,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('');
  }
}

class OpenAIClient implements LLMClient {
  readonly provider: LLMProvider;
  readonly model: string;
  private client: OpenAI;

  constructor(apiKey: string, model: string, provider: LLMProvider, baseURL?: string, defaultHeaders?: Record<string, string>) {
    this.model = model;
    this.provider = provider;
    this.client = new OpenAI({ apiKey, baseURL, defaultHeaders });
  }

  async complete(prompt: string, systemPrompt: string, options?: CompleteOptions): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 16384,
      ...(options?.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    });
    return res.choices[0]?.message?.content ?? '';
  }
}

class OllamaClient implements LLMClient {
  readonly provider = 'ollama' as const;
  readonly model: string;
  private baseURL: string;

  constructor(model: string, baseURL?: string) {
    this.model = model;
    this.baseURL = (baseURL || 'http://localhost:11434').replace(/\/+$/, '');
  }

  async complete(prompt: string, systemPrompt: string, options?: CompleteOptions): Promise<string> {
    const res = await fetch(`${this.baseURL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        system: systemPrompt,
        stream: false,
        ...(options?.jsonMode ? { format: 'json' } : {}),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama request failed (${res.status}): ${text || res.statusText}`);
    }
    const data = (await res.json()) as { response?: string };
    return data.response ?? '';
  }
}

export function createLLMClient(config: LLMConfig): LLMClient {
  const model = config.model || DEFAULT_MODELS[config.provider];
  switch (config.provider) {
    case 'anthropic':
      if (!config.apiKey) throw new Error('Anthropic API key is required.');
      return new AnthropicClient(config.apiKey, model);
    case 'openai':
      if (!config.apiKey) throw new Error('OpenAI API key is required.');
      return new OpenAIClient(config.apiKey, model, 'openai');
    case 'openai-compatible':
      if (!config.apiKey) throw new Error('API key is required for openai-compatible providers.');
      if (!config.baseURL) throw new Error('baseURL is required for openai-compatible providers.');
      return new OpenAIClient(config.apiKey, model, 'openai-compatible', config.baseURL);
    case 'openrouter':
      if (!config.apiKey) throw new Error('OpenRouter API key is required.');
      return new OpenAIClient(
        config.apiKey,
        model,
        'openrouter',
        config.baseURL || OPENROUTER_BASE_URL,
        OPENROUTER_HEADERS
      );
    case 'ollama':
      return new OllamaClient(model, config.baseURL);
    default: {
      const exhaustive: never = config.provider;
      throw new Error(`Unknown LLM provider: ${exhaustive}`);
    }
  }
}
