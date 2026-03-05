import { getModel } from '@mariozechner/pi-ai'
import type { Api, KnownProvider, Model } from '@mariozechner/pi-ai'
import type { LLMProviderType } from '@/agent/providers/types'

const DEFAULT_CONTEXT_WINDOW = 128000
const DEFAULT_MAX_TOKENS = 8192

const PROVIDER_MAP: Partial<Record<LLMProviderType, KnownProvider>> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  groq: 'groq',
  mistral: 'mistral',
  minimax: 'minimax',
  kimi: 'kimi-coding',
  glm: 'zai',
  'glm-coding': 'zai',
}

const MODEL_ALIASES: Partial<Record<LLMProviderType, Record<string, string>>> = {
  google: {
    'gemini-2.0-pro': 'gemini-2.0-flash',
  },
  minimax: {
    'abab6.5s-chat': 'MiniMax-M2',
  },
  kimi: {
    'moonshot-v1-8k': 'k2p5',
  },
  'glm-coding': {
    'glm-4-flash': 'glm-4.7-flash',
  },
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function tryGetNativeModel(
  providerType: LLMProviderType,
  modelName: string,
  baseUrl: string
): Model<Api> | null {
  const provider = PROVIDER_MAP[providerType]
  if (!provider) return null

  const alias = MODEL_ALIASES[providerType]?.[modelName]
  const candidates = alias && alias !== modelName ? [modelName, alias] : [modelName]

  for (const candidate of candidates) {
    try {
      const model = getModel(provider, candidate as never) as Model<Api>
      if (!model) continue
      if (baseUrl) {
        return { ...model, baseUrl: normalizeBaseUrl(baseUrl) }
      }
      return model
    } catch {
      // try next candidate
    }
  }

  return null
}

function createOpenAICompatibleFallback(
  providerType: LLMProviderType,
  modelName: string,
  baseUrl: string
): Model<'openai-completions'> {
  return {
    id: modelName,
    name: modelName,
    api: 'openai-completions',
    provider: providerType,
    baseUrl: normalizeBaseUrl(baseUrl),
    reasoning: true,
    input: ['text', 'image'],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
  }
}

export function resolvePiAIModel(
  providerType: LLMProviderType,
  modelName: string,
  baseUrl: string
): Model<Api> {
  const native = tryGetNativeModel(providerType, modelName, baseUrl)
  if (native) return native
  return createOpenAICompatibleFallback(providerType, modelName, baseUrl)
}
