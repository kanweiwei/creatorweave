import { zhCN } from './locales/zh-CN'
import { enUS } from './locales/en-US'
import { jaJP } from './locales/ja-JP'
import { koKR } from './locales/ko-KR'
import type { Locale } from './types'

/**
 * 默认语言
 */
export const DEFAULT_LOCALE: Locale = 'zh-CN'

/**
 * 支持的所有语言
 */
export const SUPPORTED_LOCALES: Locale[] = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR']

/**
 * 翻译映射表
 */
export const translations = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'ja-JP': jaJP,
  'ko-KR': koKR,
} as const

/**
 * RTL 语言列表（预留）
 */
export const RTL_LOCALES: Locale[] = []

const BASE_LANGUAGE_TO_LOCALE: Record<string, Locale> = {
  zh: 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR',
}

/**
 * 根据浏览器语言标签匹配支持的 Locale
 * @example
 * resolveLocaleFromLanguageTag('en-GB') => 'en-US'
 */
export function resolveLocaleFromLanguageTag(
  languageTag?: string | null
): Locale | null {
  if (!languageTag) return null

  const normalized = languageTag.trim().toLowerCase()
  if (!normalized) return null

  const exactMatch = SUPPORTED_LOCALES.find(
    (locale) => locale.toLowerCase() === normalized
  )
  if (exactMatch) return exactMatch

  const baseLanguage = normalized.split('-')[0]
  return BASE_LANGUAGE_TO_LOCALE[baseLanguage] ?? null
}

/**
 * 检测浏览器语言并匹配为支持的 Locale
 */
export function detectBrowserLocale(fallback: Locale = DEFAULT_LOCALE): Locale {
  if (typeof navigator === 'undefined') return fallback

  const candidates = [...(navigator.languages ?? []), navigator.language]

  for (const languageTag of candidates) {
    const matched = resolveLocaleFromLanguageTag(languageTag)
    if (matched) return matched
  }

  return fallback
}

/**
 * 检查是否为 RTL 语言
 */
export function isRTL(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale)
}
