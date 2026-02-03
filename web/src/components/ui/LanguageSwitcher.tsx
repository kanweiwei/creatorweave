/**
 * LanguageSwitcher - 语言切换组件
 *
 * 点击式语言切换按钮，支持中英日韩切换
 * 使用点击触发 + 点击外部关闭的模式
 */

import { useState, useRef, useEffect } from 'react'
import { Globe, Check } from 'lucide-react'
import { LOCALE_LABELS } from '@browser-fs-analyzer/i18n'
import { useLocale } from '@/i18n'
import type { Locale } from '@/i18n'

export function LanguageSwitcher() {
  const [locale, setLocale] = useLocale()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleToggle = () => setIsOpen(!isOpen)

  const handleSelect = (selectedLocale: Locale) => {
    setLocale(selectedLocale)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-2 rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
      >
        <Globe className="h-4 w-4" />
        <span className="text-xs">{LOCALE_LABELS[locale]}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 rounded-lg border bg-white py-1 shadow-lg">
          {(['zh-CN', 'en-US', 'ja-JP', 'ko-KR'] as Locale[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleSelect(key)}
              className="flex w-full items-center justify-between gap-4 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              <span>{LOCALE_LABELS[key]}</span>
              {locale === key && <Check className="h-4 w-4 text-primary-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
