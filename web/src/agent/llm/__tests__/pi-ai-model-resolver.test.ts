import { describe, expect, it } from 'vitest'
import { resolvePiAIModel } from '../pi-ai-model-resolver'

describe('resolvePiAIModel', () => {
  it('should resolve known native provider/model', () => {
    const model = resolvePiAIModel('openai', 'gpt-4o', 'https://api.openai.com/v1')
    expect(model.provider).toBe('openai')
    expect(model.id).toBe('gpt-4o')
  })

  it('should use alias for known model mismatch', () => {
    const model = resolvePiAIModel('google', 'gemini-2.0-pro', 'https://generativelanguage.googleapis.com/v1beta')
    expect(model.provider).toBe('google')
    expect(model.id).toBe('gemini-2.0-flash')
  })

  it('should fallback to openai-completions for custom provider', () => {
    const model = resolvePiAIModel('custom', 'my-model', 'https://example.com/v1/')
    expect(model.api).toBe('openai-completions')
    expect(model.id).toBe('my-model')
    expect(model.baseUrl).toBe('https://example.com/v1')
  })

  it('should fallback for unknown model on known provider', () => {
    const model = resolvePiAIModel('anthropic', 'non-existent-model', 'https://api.anthropic.com/v1')
    expect(model.api).toBe('openai-completions')
    expect(model.provider).toBe('anthropic')
  })
})

