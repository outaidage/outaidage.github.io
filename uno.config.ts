import { defineConfig, presetMini } from 'unocss'

export default defineConfig({
  presets: [presetMini()],
  theme: {
    colors: {
      primary: {
        DEFAULT: '#2563EB',
        light: '#60A5FA',
        dark: '#1D4ED8',
      },
      surface: {
        light: '#FAFAFA',
        dark: '#09090B',
      },
      card: {
        light: '#FFFFFF',
        dark: '#18181B',
      },
    },
  },
  shortcuts: {
    'card-base': 'rounded-xl border border-gray-200 dark:border-zinc-800 p-4 transition-all hover:border-primary',
    'text-desc': 'text-gray-500 dark:text-zinc-400 text-sm',
  },
})
