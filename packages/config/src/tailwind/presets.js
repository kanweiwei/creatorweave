/**
 * Tailwind CSS Presets
 *
 * Pre-configured Tailwind presets for different project types.
 *
 * @module tailwind/presets
 */

import { createBaseConfig } from './index.js'

/**
 * Web application preset
 * Includes standard web content paths and full design system
 *
 * @type {import('tailwindcss').Config}
 */
export const webPreset = createBaseConfig({
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
})

/**
 * Mobile web preset
 * Includes mobile-specific breakpoints and optimizations
 *
 * @type {import('tailwindcss').Config}
 */
export const mobilePreset = {
  ...createBaseConfig({
    content: [
      './index.html',
      './src/**/*.{js,ts,jsx,tsx}',
    ],
  }),
  theme: {
    extend: {
      screens: {
        xs: '375px',  // Small mobile
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
    },
  },
}

/**
 * Library preset
 * For component libraries that need minimal config
 *
 * @type {import('tailwindcss').Config}
 */
export const libraryPreset = createBaseConfig({
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
})

export default {
  web: webPreset,
  mobile: mobilePreset,
  library: libraryPreset,
}
