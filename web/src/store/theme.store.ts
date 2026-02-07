/**
 * Theme Store - manages application theme (light/dark mode).
 *
 * Features:
 * - Light/dark mode toggle
 * - System preference detection
 * - Persisted to localStorage
 * - Applies theme classes to document root
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark' | 'system'

/**
 * Theme store state
 */
interface ThemeState {
  mode: ThemeMode
  resolvedTheme: 'light' | 'dark'
  setTheme: (mode: ThemeMode) => void
}

/**
 * Get system theme preference
 */
function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Apply theme to document root
 */
function applyTheme(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(theme)

  // Update meta theme-color for mobile browsers
  const metaThemeColor = document.querySelector('meta[name="theme-color"]')
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', theme === 'dark' ? '#1a1a1a' : '#ffffff')
  }
}

/**
 * Resolve theme mode to actual theme
 */
function resolveThemeMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return getSystemTheme()
  }
  return mode
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'system',
      resolvedTheme: resolveThemeMode('system'),

      setTheme: (mode) => {
        const resolvedTheme = resolveThemeMode(mode)
        applyTheme(resolvedTheme)
        set({ mode, resolvedTheme })
      },
    }),
    {
      name: 'bfosa-theme',
      onRehydrateStorage: () => (state) => {
        // Apply theme on rehydration
        if (state) {
          const resolvedTheme = resolveThemeMode(state.mode)
          applyTheme(resolvedTheme)
          state.resolvedTheme = resolvedTheme
        }
      },
    }
  )
)

/**
 * Initialize theme system
 * - Listen for system theme changes when in system mode
 * - Apply initial theme
 */
export function initializeTheme() {
  const { mode } = useThemeStore.getState()

  // Apply initial theme
  const resolvedTheme = resolveThemeMode(mode)
  applyTheme(resolvedTheme)

  // Listen for system theme changes
  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      const currentMode = useThemeStore.getState().mode
      if (currentMode === 'system') {
        const newTheme = e.matches ? 'dark' : 'light'
        applyTheme(newTheme)
        useThemeStore.setState({ resolvedTheme: newTheme })
      }
    }

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange)
    } else {
      // Legacy browsers
      mediaQuery.addListener(handleSystemThemeChange)
    }

    // Return cleanup function
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleSystemThemeChange)
      } else {
        mediaQuery.removeListener(handleSystemThemeChange)
      }
    }
  }

  return () => {}
}

/**
 * Hook to get current theme and toggle function
 */
export function useTheme() {
  const { mode, resolvedTheme, setTheme } = useThemeStore()

  const toggleTheme = () => {
    // If current mode is 'system', toggle to light, then dark
    // If current mode is 'light' or 'dark', toggle between them
    const newMode: ThemeMode = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'light'
    setTheme(newMode)
  }

  return {
    mode,
    theme: resolvedTheme,
    setTheme,
    toggleTheme,
    isDark: resolvedTheme === 'dark',
    isLight: resolvedTheme === 'light',
  }
}

// Export types
export type { ThemeState }
