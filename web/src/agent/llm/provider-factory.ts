import { PiAIProvider } from './pi-ai-provider'
import type { LLMProviderType } from '@/agent/providers/types'

export interface CreateProviderInput {
  apiKey: string
  providerType: LLMProviderType
  baseUrl: string
  model: string
}

export function createLLMProvider(input: CreateProviderInput): PiAIProvider {
  return new PiAIProvider({
    apiKey: input.apiKey,
    providerType: input.providerType,
    baseUrl: input.baseUrl,
    model: input.model,
  })
}
